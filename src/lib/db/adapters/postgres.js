// src/lib/db/adapters/postgres.js
import { Pool } from "pg";
import { BaseDatabaseAdapter } from "../base.js";
import {
  normalizeRecord,
  quoteIdentifier,
  inferColumnTypes,
  generateCreateTableSQL,
} from "../../normalizer.js";

export class PostgresAdapter extends BaseDatabaseAdapter {
  constructor(config = {}) {
    super(config);
    this.pool = null;
    this.tableColumnsCache = new Map();
  }

  getPoolConfig() {
    if (this.config.uri) {
      const ssl =
        this.config.ssl === true ||
        (typeof this.config.ssl === "string" && this.config.ssl.toLowerCase() === "true") ||
        (this.config.uri.includes("sslmode=require"))
          ? { rejectUnauthorized: false }
          : false;

      return {
        connectionString: this.config.uri.trim(),
        ssl,
        connectionTimeoutMillis: 10000,
      };
    }

    const {
      host = "localhost",
      port = 5432,
      database = "postgres",
      username = "postgres",
      password = "",
      ssl = false,
    } = this.config;

    return {
      host,
      port: Number(port),
      database,
      user: username,
      password: String(password),
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    };
  }

  async connect() {
    if (this.pool) return;
    const poolConfig = this.getPoolConfig();
    this.pool = new Pool(poolConfig);
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
      const res = await this.pool.query("SELECT version() as version, current_database() as db");
      return {
        success: true,
        latencyMs: Date.now() - start,
        version: res.rows[0]?.version?.split(" ")[0] + " " + res.rows[0]?.version?.split(" ")[1] || "PostgreSQL",
        database: res.rows[0]?.db,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || "Failed to connect to PostgreSQL",
      };
    }
  }

  async listEntities() {
    await this.connect();
    const query = `
      SELECT 
        t.table_name,
        COALESCE(c.reltuples, 0)::bigint AS estimated_count
      FROM information_schema.tables t
      LEFT JOIN pg_class c ON c.relname = t.table_name
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name;
    `;

    const res = await this.pool.query(query);
    const entities = [];

    for (const row of res.rows) {
      let count = Number(row.estimated_count);
      if (count < 0) count = 0;
      entities.push({
        name: row.table_name,
        type: "table",
        count,
      });
    }

    return entities;
  }

  async countEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "postgres");
    try {
      const res = await this.pool.query(`SELECT COUNT(*)::bigint AS total FROM ${quoted}`);
      return Number(res.rows[0]?.total || 0);
    } catch {
      return 0;
    }
  }

  async readBatch(entityName, options = { limit: 500, offset: 0 }) {
    await this.connect();
    const { limit = 500, offset = 0 } = options;
    const quoted = quoteIdentifier(entityName, "postgres");

    const totalCount = await this.countEntity(entityName);
    const query = `SELECT * FROM ${quoted} LIMIT $1 OFFSET $2`;
    const res = await this.pool.query(query, [limit, offset]);

    const rows = res.rows.map((r) => normalizeRecord(r));
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
      WHERE table_name = $1 AND table_schema = current_schema();
    `;
    const res = await this.pool.query(query, [entityName]);
    const cols = res.rows.map((r) => ({ name: r.column_name, type: r.data_type }));
    this.tableColumnsCache.set(entityName, cols);
    return cols;
  }

  async ensureTableExists(entityName, sampleRows) {
    const existing = await this.getTableColumns(entityName);
    if (existing.length > 0) return existing;

    // Table doesn't exist, dynamically infer schema and create it
    const colTypes = inferColumnTypes(sampleRows, "postgres");
    const ddl = generateCreateTableSQL(entityName, colTypes, "postgres");
    await this.pool.query(ddl);

    this.tableColumnsCache.delete(entityName);
    return await this.getTableColumns(entityName);
  }

  async writeBatch(entityName, rows, options = {}) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    await this.connect();
    const quotedTable = quoteIdentifier(entityName, "postgres");

    if (options.isFirstBatch) {
      if (options.mode === "overwrite") {
        await this.pool.query(`DROP TABLE IF EXISTS ${quotedTable} CASCADE;`);
        this.tableColumnsCache.delete(entityName);
      }
    }

    // Ensure table exists
    const tableColumns = await this.ensureTableExists(entityName, rows);
    const validColNames = new Set(tableColumns.map((c) => c.name));

    if (options.isFirstBatch && options.mode === "truncate") {
      await this.pool.query(`TRUNCATE TABLE ${quotedTable} CASCADE;`);
    }

    // Prepare rows with column alignment
    // Collect all unique keys that exist in validColNames
    const insertCols = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (validColNames.has(k) && !insertCols.includes(k)) {
          insertCols.push(k);
        }
      }
    }

    if (insertCols.length === 0) {
      // Fallback: check if 'data' column exists for dumping document
      if (validColNames.has("data")) {
        insertCols.push("data");
      } else {
        return { inserted: 0, errors: ["No matching columns found between source and destination table"] };
      }
    }

    const CHUNK_SIZE = 100;
    let totalInserted = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values = [];
      const rowPlaceholders = [];

      let paramIdx = 1;
      for (const row of chunk) {
        const itemPlaceholders = [];
        for (const col of insertCols) {
          let val = row[col];
          if (col === "data" && val === undefined) {
            val = JSON.stringify(row);
          } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val === undefined ? null : val);
          itemPlaceholders.push(`$${paramIdx++}`);
        }
        rowPlaceholders.push(`(${itemPlaceholders.join(", ")})`);
      }

      const quotedCols = insertCols.map((c) => quoteIdentifier(c, "postgres")).join(", ");
      const query = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT DO NOTHING;`;

      try {
        const result = await this.pool.query(query, values);
        totalInserted += result.rowCount || chunk.length;
      } catch (err) {
        errors.push(err.message);
      }
    }

    return { inserted: totalInserted, errors: errors.length > 0 ? errors : undefined };
  }

  async dropEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "postgres");
    this.tableColumnsCache.delete(entityName);
    return await this.pool.query(`DROP TABLE IF EXISTS ${quoted} CASCADE;`);
  }

  async truncateEntity(entityName) {
    await this.connect();
    const quoted = quoteIdentifier(entityName, "postgres");
    return await this.pool.query(`TRUNCATE TABLE ${quoted} CASCADE;`);
  }

  async dropDatabase() {
    await this.connect();
    const dbName = this.config.database;
    if (!dbName) throw new Error("Database name not specified");
    const quoted = quoteIdentifier(dbName, "postgres");
    return await this.pool.query(`DROP DATABASE IF EXISTS ${quoted};`);
  }
}

