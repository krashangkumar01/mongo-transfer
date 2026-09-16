// src/lib/db/adapters/mongo.js
import { MongoClient } from "mongodb";
import { BaseDatabaseAdapter } from "../base.js";
import { normalizeRecord } from "../../normalizer.js";

export class MongoAdapter extends BaseDatabaseAdapter {
  constructor(config = {}) {
    super(config);
    this.client = null;
    this.db = null;
    this.dbName = null;
  }

  buildConnectionString() {
    if (this.config.uri) return this.config.uri.trim();

    const { host = "localhost", port = 27017, database = "test", username, password, authSource, srv } = this.config;
    const protocol = srv ? "mongodb+srv" : "mongodb";
    const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
    const portPart = srv ? "" : `:${port}`;
    const query = authSource ? `?authSource=${encodeURIComponent(authSource)}` : "";

    return `${protocol}://${auth}${host}${portPart}/${database}${query}`;
  }

  async connect() {
    if (this.client) return;

    const uri = this.buildConnectionString();
    this.client = new MongoClient(uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    await this.client.connect();

    // Extract database name from URI or config
    let dbName = this.config.database;
    if (!dbName && uri) {
      try {
        const parsed = new URL(uri.replace(/^mongodb\+srv:\/\//, "http://").replace(/^mongodb:\/\//, "http://"));
        dbName = parsed.pathname.replace(/^\//, "").split("?")[0];
      } catch {
        dbName = "test";
      }
    }
    this.dbName = dbName || "test";
    this.db = this.client.db(this.dbName);
  }

  async disconnect() {
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
      this.db = null;
    }
  }

  async testConnection() {
    const start = Date.now();
    try {
      await this.connect();
      await this.db.command({ ping: 1 });
      let version = "unknown";
      try {
        const buildInfo = await this.db.command({ buildInfo: 1 });
        version = buildInfo.version;
      } catch {}
      return {
        success: true,
        latencyMs: Date.now() - start,
        version: `MongoDB ${version}`,
        database: this.dbName,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || "Failed to connect to MongoDB",
      };
    }
  }

  async listEntities() {
    await this.connect();
    const collections = await this.db.listCollections().toArray();
    const entities = [];

    for (const col of collections) {
      // Exclude system collections
      if (col.name.startsWith("system.")) continue;

      let count = 0;
      try {
        count = await this.db.collection(col.name).estimatedDocumentCount();
      } catch {
        try {
          count = await this.db.collection(col.name).countDocuments();
        } catch {}
      }

      entities.push({
        name: col.name,
        type: "collection",
        count,
      });
    }

    return entities;
  }

  async countEntity(entityName) {
    await this.connect();
    try {
      return await this.db.collection(entityName).estimatedDocumentCount();
    } catch {
      return await this.db.collection(entityName).countDocuments();
    }
  }

  async readBatch(entityName, options = { limit: 500, offset: 0 }) {
    await this.connect();
    const { limit = 500, offset = 0 } = options;
    const col = this.db.collection(entityName);

    const totalCount = await this.countEntity(entityName);
    const cursor = col.find({}).skip(offset).limit(limit);
    const rawDocs = await cursor.toArray();

    const rows = rawDocs.map((doc) => normalizeRecord(doc));
    const hasMore = offset + rawDocs.length < totalCount;

    return {
      rows,
      hasMore,
      totalCount,
      nextCursor: offset + rawDocs.length,
    };
  }

  async writeBatch(entityName, rows, options = {}) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    await this.connect();
    const col = this.db.collection(entityName);

    // Initial setup if first batch
    if (options.isFirstBatch) {
      if (options.mode === "overwrite") {
        await col.drop().catch(() => {});
      } else if (options.mode === "truncate") {
        await col.deleteMany({});
      }
    }

    // Prepare docs
    const cleanedRows = rows.map((r) => {
      const copy = { ...r };
      // If row has no _id or invalid _id, remove or preserve
      return copy;
    });

    try {
      // insertMany with unordered execution to skip duplicates on append
      const res = await col.insertMany(cleanedRows, { ordered: false });
      return { inserted: res.insertedCount || cleanedRows.length };
    } catch (err) {
      // If duplicate key error occurred, inspect inserted count
      if (err.code === 11000 || err.writeErrors) {
        const inserted = err.result?.nInserted || (cleanedRows.length - (err.writeErrors?.length || 0));
        return { inserted: Math.max(0, inserted), errors: [err.message] };
      }
      throw err;
    }
  }

  async dropEntity(entityName) {
    await this.connect();
    return await this.db.collection(entityName).drop();
  }

  async truncateEntity(entityName) {
    await this.connect();
    return await this.db.collection(entityName).deleteMany({});
  }

  async dropDatabase() {
    await this.connect();
    return await this.db.dropDatabase();
  }
}

