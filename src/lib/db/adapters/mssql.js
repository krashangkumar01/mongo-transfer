// src/lib/db/adapters/mssql.js
import sql from "mssql";
import { BaseDatabaseAdapter } from "../base.js";
import {
  normalizeRecord,
  quoteIdentifier,
  inferColumnTypes,
  generateCreateTableSQL,
} from "../../normalizer.js";

export class MSSQLAdapter extends BaseDatabaseAdapter {
  constructor(config = {}) {
    super(config);
    this.pool = null;
    this.tableColumnsCache = new Map();
  }

  getPoolConfig() {
    if (this.config.uri) {
      return this.config.uri.trim();
    }

    const {
      host = "localhost",
      port = 1433,
      database = "master",
      username = "sa",
      password = "",
      encrypt = true,
      trustServerCertificate = true,
    } = this.config;

    return {
      server: host,
      port: Number(port),
      database,
      user: username,
      password: String(password),
      options: {
        encrypt: encrypt === true || encrypt === "true",
        trustServerCertificate: trustServerCertificate === true || trustServerCertificate === "true",
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    };
  }

  async connect() {
    if (this.pool && this.pool.connected) return;
    const poolConfig = this.getPoolConfig();
    this.pool = await new sql.ConnectionPool(poolConfig).connect();
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.close().catch(() => {});
      this.pool = null;
      this.tableColumnsCache.clear();
    }
  }

  async testConnection() {
    const start = Date.now();
    try {
      await this.connect();
      const res = await this.pool.request().query("SELECT @@VERSION as version, DB_NAME() as db");
      const verLine = res.recordset[0]?.version || "";
      const firstLine = verLine.split("\n")[0] || "Microsoft SQL Server";
      return {
        success: true,
        latencyMs: Date.now() - start,
        version: firstLine.substring(0, 40),
        database: res.recordset[0]?.db,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || "Failed to connect to SQL Server",
      };
    }
  }

  async listEntities() {
    await this.connect();
    const query = `
      SELECT 
        t.name AS table_name,
        SUM(p.rows) AS estimated_count
      FROM sys.tables t
      INNER JOIN sys.partitions p ON t.object_id = p.object_id
      WHERE p.index_id IN (0, 1) AND t.is_ms_shipped = 0
      GROUP BY t.name
      ORDER BY t.name;
    `;

    const res = await this.pool.request().query(query);
    const entities = [];

    for (const row of res.recordset) {
      entities.push({
        name: row.table_name,
        type: "table",
        count: Number(row.estimated_count || 0),
      });
    }

    return entities;
  }

  async countEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mssql");
    try {
      const res = await this.pool.request().query(`SELECT COUNT_BIG(*) AS total FROM ${quoted}`);
      return Number(res.recordset[0]?.total || 0);
    } catch {
      return 0;
    }
  }

  async readBatch(entityName, options = { limit: 500, offset: 0 }) {
    await this.connect();
    const { limit = 500, offset = 0 } = options;
    const quoted = quoteIdentifier(entityName, "mssql");

    const totalCount = await this.countEntity(entityName);
    const query = `
      SELECT * FROM ${quoted}
      ORDER BY (SELECT NULL)
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;

    const req = this.pool.request();
    req.input("offset", sql.Int, Number(offset));
    req.input("limit", sql.Int, Number(limit));
    const res = await req.query(query);

    const rows = res.recordset.map((r) => normalizeRecord(r));
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
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = @tableName;
    `;
    const req = this.pool.request();
    req.input("tableName", sql.NVarChar, entityName);
    const res = await req.query(query);

    const cols = res.recordset.map((r) => ({
      name: r.COLUMN_NAME,
      type: r.DATA_TYPE,
    }));
    this.tableColumnsCache.set(entityName, cols);
    return cols;
  }

  async ensureTableExists(entityName, sampleRows) {
    const existing = await this.getTableColumns(entityName);
    if (existing.length > 0) return existing;

    const colTypes = inferColumnTypes(sampleRows, "mssql");
    const ddl = generateCreateTableSQL(entityName, colTypes, "mssql");
    await this.pool.request().query(ddl);

    this.tableColumnsCache.delete(entityName);
    return await this.getTableColumns(entityName);
  }

  async writeBatch(entityName, rows, options = {}) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    await this.connect();
    const quotedTable = quoteIdentifier(entityName, "mssql");

    if (options.isFirstBatch) {
      if (options.mode === "overwrite") {
        await this.pool.request().query(`IF OBJECT_ID('${entityName}', 'U') IS NOT NULL DROP TABLE ${quotedTable};`);
        this.tableColumnsCache.delete(entityName);
      }
    }

    const tableColumns = await this.ensureTableExists(entityName, rows);
    const validColNames = new Set(tableColumns.map((c) => c.name));

    if (options.isFirstBatch && options.mode === "truncate") {
      await this.pool.request().query(`TRUNCATE TABLE ${quotedTable};`);
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

    const CHUNK_SIZE = 100;
    let totalInserted = 0;
    const errors = [];

    const quotedCols = insertCols.map((c) => quoteIdentifier(c, "mssql")).join(", ");

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const req = this.pool.request();
      const rowClauses = [];

      chunk.forEach((row, rowIdx) => {
        const itemPlaceholders = [];
        insertCols.forEach((col) => {
          const paramName = `p_${rowIdx}_${col.replace(/[^a-zA-Z0-9_]/g, "")}`;
          let val = row[col];
          if (col === "data" && val === undefined) {
            val = JSON.stringify(row);
          } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          req.input(paramName, val === undefined ? null : val);
          itemPlaceholders.push(`@${paramName}`);
        });
        rowClauses.push(`(${itemPlaceholders.join(", ")})`);
      });

      const query = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES ${rowClauses.join(", ")};`;

      try {
        const result = await req.query(query);
        totalInserted += result.rowsAffected[0] || chunk.length;
      } catch (err) {
        errors.push(err.message);
      }
    }

    return { inserted: totalInserted, errors: errors.length > 0 ? errors : undefined };
  }

  async dropEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mssql");
    this.tableColumnsCache.delete(entityName);
    return await this.pool.request().query(`IF OBJECT_ID('${entityName}', 'U') IS NOT NULL DROP TABLE ${quoted};`);
  }

  async truncateEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "mssql");
    return await this.pool.request().query(`TRUNCATE TABLE ${quoted};`);
  }

  async dropDatabase() {
    await this.connect();
    const dbName = this.config.database;
    if (!dbName) throw new Error("Database name not specified");
    const quoted = quoteIdentifier(dbName, "mssql");
    return await this.pool.request().query(`ALTER DATABASE ${quoted} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${quoted};`);
  }
}

