// src/lib/db/factory.js
import { SUPPORTED_DATABASES, normalizeDbType } from "./constants.js";

export { SUPPORTED_DATABASES, normalizeDbType };

/**
 * Create a database adapter for the given type and configuration
 * Uses dynamic imports for on-demand driver loading
 * @param {string} type
 * @param {object} config
 * @returns {Promise<BaseDatabaseAdapter>}
 */
export async function createDatabaseAdapter(type, config = {}) {
  const normalized = normalizeDbType(type);

  switch (normalized) {
    case "mongodb": {
      const { MongoAdapter } = await import("./adapters/mongo.js");
      return new MongoAdapter(config);
    }
    case "postgresql": {
      const { PostgresAdapter } = await import("./adapters/postgres.js");
      return new PostgresAdapter(config);
    }
    case "mysql": {
      const { MySQLAdapter } = await import("./adapters/mysql.js");
      return new MySQLAdapter(config);
    }
    case "mssql": {
      const { MSSQLAdapter } = await import("./adapters/mssql.js");
      return new MSSQLAdapter(config);
    }
    case "dynamodb": {
      const { DynamoDBAdapter } = await import("./adapters/dynamodb.js");
      return new DynamoDBAdapter(config);
    }
    default:
      throw new Error(
        `Unsupported database type "${type}". Supported engines: mongodb, postgresql, mysql, mssql, dynamodb.`
      );
  }
}
