// src/lib/db/adapters/mysql.js
import mysql from "mysql2/promise";
import { BaseDatabaseAdapter } from "../base.js";
import {
  normalizeRecord,
  quoteIdentifier,
  inferColumnTypes,
  generateCreateTableSQL,
} from "../../normalizer.js";

export class MySQLAdapter extends BaseDatabaseAdapter {
  constructor(config = {}) {
    super(config);
    this.pool = null;
    this.tableColumnsCache = new Map();
  }

  getPoolConfig() {
    if (this.config.uri) {
      return {
        uri: this.config.uri.trim(),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      };
    }

    const {
      host = "localhost",
      port = 3306,
      database = "mysql",
      username = "root",
      password = "",
      ssl = false,
    } = this.config;

    return {
      host,
      port: Number(port),
      database,
      user: username,
      password: String(password),
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };
  }

  async connect() {
    if (this.pool) return;
    const poolConfig = this.getPoolConfig();
    this.pool = mysql.createPool(poolConfig);
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
      this.tableColumnsCache.clear();
    }
  }

  async testConnection() {
    const start = Date.now();
    try {
      await this.connect();
      const [rows] = await this.pool.query("SELECT VERSION() as version, DATABASE() as db");
      return {
        success: true,
        latencyMs: Date.now() - start,
        version: `MySQL ${rows[0]?.version || ""}`,
        database: rows[0]?.db,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || "Failed to connect to MySQL",
      };
    }
  }

  async listEntities() {
    await this.connect();
    const query = `
      SELECT 
        table_name,
        COALESCE(table_rows, 0) AS estimated_count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const [rows] = await this.pool.query(query);
    const entities = [];

    for (const row of rows) {
      entities.push({
        name: row.table_name || row.TABLE_NAME,
        type: "table",
        count: Number(row.estimated_count || row.TABLE_ROWS || 0),
      });
    }

    return entities;
  }

  async countEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mysql");
    try {
      const [rows] = await this.pool.query(`SELECT COUNT(*) AS total FROM ${quoted}`);
      return Number(rows[0]?.total || 0);
    } catch {
      return 0;
    }
  }

  async readBatch(entityName, options = { limit: 500, offset: 0 }) {
    await this.connect();
    const { limit = 500, offset = 0 } = options;
    const quoted = quoteIdentifier(entityName, "mysql");

    const totalCount = await this.countEntity(entityName);
    const query = `SELECT * FROM ${quoted} LIMIT ? OFFSET ?`;
    const [rawRows] = await this.pool.query(query, [Number(limit), Number(offset)]);

    const rows = rawRows.map((r) => normalizeRecord(r));
    const hasMore = offset + rows.length < totalCount;

    return {
      rows,
      hasMore,
      totalCount,
      nextCursor: offset + rows.length,
    };
  }

  async getTableColumns(entityName) {
    if (this.tableColumnsCache.has(entityName)) {
      return this.tableColumnsCache.get(entityName);
    }

    const query = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = ?;
    `;
    const [rows] = await this.pool.query(query, [entityName]);
    const cols = rows.map((r) => ({
      name: r.column_name || r.COLUMN_NAME,
      type: r.data_type || r.DATA_TYPE,
    }));
    this.tableColumnsCache.set(entityName, cols);
    return cols;
  }

  async ensureTableExists(entityName, sampleRows) {
    const existing = await this.getTableColumns(entityName);
    if (existing.length > 0) return existing;

    const colTypes = inferColumnTypes(sampleRows, "mysql");
    const ddl = generateCreateTableSQL(entityName, colTypes, "mysql");
    await this.pool.query(ddl);

    this.tableColumnsCache.delete(entityName);
    return await this.getTableColumns(entityName);
  }

  async writeBatch(entityName, rows, options = {}) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    await this.connect();
    const quotedTable = quoteIdentifier(entityName, "mysql");

    if (options.isFirstBatch) {
      if (options.mode === "overwrite") {
        await this.pool.query(`DROP TABLE IF EXISTS ${quotedTable};`);
        this.tableColumnsCache.delete(entityName);
      }
    }

    const tableColumns = await this.ensureTableExists(entityName, rows);
    const validColNames = new Set(tableColumns.map((c) => c.name));

    if (options.isFirstBatch && options.mode === "truncate") {
      await this.pool.query(`TRUNCATE TABLE ${quotedTable};`);
    }

    const insertCols = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (validColNames.has(k) && !insertCols.includes(k)) {
          insertCols.push(k);
        }
      }
    }

    if (insertCols.length === 0) {
      if (validColNames.has("data")) {
        insertCols.push("data");
      } else {
        return { inserted: 0, errors: ["No matching columns found for destination table"] };
      }
    }

    const CHUNK_SIZE = 250;
    let totalInserted = 0;
    const errors = [];

    const quotedCols = insertCols.map((c) => quoteIdentifier(c, "mysql")).join(", ");

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const valuesMatrix = chunk.map((row) => {
        return insertCols.map((col) => {
          let val = row[col];
          if (col === "data" && val === undefined) {
            val = JSON.stringify(row);
          } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          return val === undefined ? null : val;
        });
      });

      const query = `INSERT IGNORE INTO ${quotedTable} (${quotedCols}) VALUES ?;`;

      try {
        const [result] = await this.pool.query(query, [valuesMatrix]);
        totalInserted += result.affectedRows || chunk.length;
      } catch (err) {
        errors.push(err.message);
      }
    }

    return { inserted: totalInserted, errors: errors.length > 0 ? errors : undefined };
  }

  async dropEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mysql");
    this.tableColumnsCache.delete(entityName);
    return await this.pool.query(`DROP TABLE IF EXISTS ${quoted};`);
  }

  async truncateEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mysql");
    return await this.pool.query(`TRUNCATE TABLE ${quoted};`);
  }

  async dropDatabase() {
    await this.connect();
    const [rows] = await this.pool.query("SELECT DATABASE() as db");
    const dbName = rows[0]?.db;
    if (!dbName) throw new Error("Database name not specified");
    const quoted = quoteIdentifier(dbName, "mysql");
    return await this.pool.query(`DROP DATABASE IF EXISTS ${quoted};`);
  }
}

