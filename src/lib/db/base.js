// src/lib/db/base.js

export class BaseDatabaseAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Connect to database
   */
  async connect() {
    throw new Error("connect() must be implemented by subclass");
  }

  /**
   * Close connection/pool
   */
  async disconnect() {
    throw new Error("disconnect() must be implemented by subclass");
  }

  /**
   * Test database connectivity
   * @returns {Promise<{ success: boolean, message?: string, version?: string, latencyMs?: number }>}
   */
  async testConnection() {
    throw new Error("testConnection() must be implemented by subclass");
  }

  /**
   * List all entities (tables or collections)
   * @returns {Promise<Array<{ name: string, type: string, count?: number, schema?: any }>>}
   */
  async listEntities() {
    throw new Error("listEntities() must be implemented by subclass");
  }

  /**
   * Read batch of records
   * @param {string} entityName
   * @param {{ limit: number, offset: number, cursor?: any }} options
   * @returns {Promise<{ rows: Array<Record<string, any>>, hasMore: boolean, nextCursor?: any, totalCount?: number }>}
   */
  async readBatch(entityName, options = { limit: 500, offset: 0 }) {
    throw new Error("readBatch() must be implemented by subclass");
  }

  /**
   * Write batch of records to destination entity
   * @param {string} entityName
   * @param {Array<Record<string, any>>} rows
   * @param {{ mode: 'append'|'truncate'|'overwrite', isFirstBatch?: boolean }} options
   * @returns {Promise<{ inserted: number, errors?: string[] }>}
   */
  async writeBatch(entityName, rows, options = {}) {
    throw new Error("writeBatch() must be implemented by subclass");
  }

  /**
   * Count total items in entity
   * @param {string} entityName
   * @returns {Promise<number>}
   */
  async countEntity(entityName) {
    throw new Error("countEntity() must be implemented by subclass");
  }

  /**
   * Drop entity (table or collection)
   * @param {string} entityName
   */
  async dropEntity(entityName) {
    throw new Error("dropEntity() must be implemented by subclass");
  }

  /**
   * Truncate entity (delete records, retain structure)
   * @param {string} entityName
   */
  async truncateEntity(entityName) {
    throw new Error("truncateEntity() must be implemented by subclass");
  }

  /**
   * Drop entire database
   */
  async dropDatabase() {
    throw new Error("dropDatabase() must be implemented by subclass");
  }
}

