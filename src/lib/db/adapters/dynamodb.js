// src/lib/db/adapters/dynamodb.js
import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { BaseDatabaseAdapter } from "../base.js";
import { normalizeRecord } from "../../normalizer.js";

export class DynamoDBAdapter extends BaseDatabaseAdapter {
  constructor(config = {}) {
    super(config);
    this.rawClient = null;
    this.docClient = null;
    this.tableKeysCache = new Map();
  }

  getClientConfig() {
    const {
      region = "us-east-1",
      accessKeyId,
      secretAccessKey,
      sessionToken,
      endpoint,
    } = this.config;

    const clientConfig = {
      region,
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        ...(sessionToken ? { sessionToken: sessionToken.trim() } : {}),
      };
    }

    return clientConfig;
  }

  async connect() {
    if (this.docClient) return;
    const clientConfig = this.getClientConfig();
    this.rawClient = new DynamoDBClient(clientConfig);
    this.docClient = DynamoDBDocumentClient.from(this.rawClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }

  async disconnect() {
    if (this.rawClient) {
      this.rawClient.destroy();
      this.rawClient = null;
      this.docClient = null;
      this.tableKeysCache.clear();
    }
  }

  async testConnection() {
    const start = Date.now();
    try {
      await this.connect();
      const res = await this.rawClient.send(new ListTablesCommand({ Limit: 1 }));
      return {
        success: true,
        latencyMs: Date.now() - start,
        version: "AWS DynamoDB",
        database: `Region: ${this.config.region || "us-east-1"}`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: err.message || "Failed to connect to DynamoDB",
      };
    }
  }

  async listEntities() {
    await this.connect();
    const tables = [];
    let lastEvaluatedTableName;

    do {
      const res = await this.rawClient.send(
        new ListTablesCommand({
          ExclusiveStartTableName: lastEvaluatedTableName,
        })
      );
      if (res.TableNames) {
        tables.push(...res.TableNames);
      }
      lastEvaluatedTableName = res.LastEvaluatedTableName;
    } while (lastEvaluatedTableName);

    const entities = [];
    for (const tableName of tables) {
      let count = 0;
      try {
        const desc = await this.rawClient.send(new DescribeTableCommand({ TableName: tableName }));
        count = desc.Table?.ItemCount || 0;
        const keySchema = desc.Table?.KeySchema || [];
        this.tableKeysCache.set(tableName, keySchema);
      } catch {}

      entities.push({
        name: tableName,
        type: "collection",
        count,
      });
    }

    return entities;
  }

  async countEntity(entityName) {
    await this.connect();
    try {
      const desc = await this.rawClient.send(new DescribeTableCommand({ TableName: entityName }));
      return desc.Table?.ItemCount || 0;
    } catch {
      return 0;
    }
  }

  async readBatch(entityName, options = { limit: 500, cursor: null }) {
    await this.connect();
    const { limit = 500, cursor } = options;

    let exclusiveStartKey;
    if (cursor) {
      try {
        exclusiveStartKey = typeof cursor === "string" ? JSON.parse(cursor) : cursor;
      } catch {}
    }

    const res = await this.docClient.send(
      new ScanCommand({
        TableName: entityName,
        Limit: Number(limit),
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const rows = (res.Items || []).map((item) => normalizeRecord(item));
    const hasMore = Boolean(res.LastEvaluatedKey);

    return {
      rows,
      hasMore,
      totalCount: await this.countEntity(entityName),
      nextCursor: res.LastEvaluatedKey ? JSON.stringify(res.LastEvaluatedKey) : null,
    };
  }

  async getTableKeySchema(entityName) {
    if (this.tableKeysCache.has(entityName)) {
      return this.tableKeysCache.get(entityName);
    }
    try {
      const desc = await this.rawClient.send(new DescribeTableCommand({ TableName: entityName }));
      const keySchema = desc.Table?.KeySchema || [];
      this.tableKeysCache.set(entityName, keySchema);
      return keySchema;
    } catch {
      return null;
    }
  }

  async ensureTableExists(entityName, sampleRows = []) {
    let keySchema = await this.getTableKeySchema(entityName);
    if (keySchema && keySchema.length > 0) return keySchema;

    // Determine primary key name from sample rows
    let hashKeyName = "id";
    if (sampleRows.length > 0) {
      const first = sampleRows[0];
      if ("_id" in first && !("id" in first)) {
        hashKeyName = "_id";
      } else if ("id" in first) {
        hashKeyName = "id";
      }
    }

    try {
      await this.rawClient.send(
        new CreateTableCommand({
          TableName: entityName,
          KeySchema: [{ AttributeName: hashKeyName, KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: hashKeyName, AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        })
      );

      // Wait briefly for table to become ACTIVE
      let active = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const desc = await this.rawClient.send(new DescribeTableCommand({ TableName: entityName }));
        if (desc.Table?.TableStatus === "ACTIVE") {
          active = true;
          break;
        }
      }

      keySchema = [{ AttributeName: hashKeyName, KeyType: "HASH" }];
      this.tableKeysCache.set(entityName, keySchema);
      return keySchema;
    } catch (err) {
      if (err.name === "ResourceInUseException") {
        return await this.getTableKeySchema(entityName);
      }
      throw err;
    }
  }

  async writeBatch(entityName, rows, options = {}) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    await this.connect();

    if (options.isFirstBatch) {
      if (options.mode === "overwrite") {
        await this.rawClient.send(new DeleteTableCommand({ TableName: entityName })).catch(() => {});
        this.tableKeysCache.delete(entityName);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const keySchema = await this.ensureTableExists(entityName, rows);
    const hashKey = keySchema?.[0]?.AttributeName || "id";

    // Format items ensuring primary key exists
    const preparedItems = rows.map((r, idx) => {
      const copy = { ...r };
      if (!copy[hashKey]) {
        copy[hashKey] = copy._id || copy.id || `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
      }
      // Convert primary key to string if needed
      copy[hashKey] = String(copy[hashKey]);
      return copy;
    });

    // BatchWriteItem allows up to 25 items at a time
    const CHUNK_SIZE = 25;
    let totalInserted = 0;
    const errors = [];

    for (let i = 0; i < preparedItems.length; i += CHUNK_SIZE) {
      const chunk = preparedItems.slice(i, i + CHUNK_SIZE);
      let putRequests = chunk.map((item) => ({
        PutRequest: { Item: item },
      }));

      let attempts = 0;
      while (putRequests.length > 0 && attempts < 4) {
        attempts++;
        try {
          const res = await this.docClient.send(
            new BatchWriteCommand({
              RequestItems: {
                [entityName]: putRequests,
              },
            })
          );

          const unprocessed = res.UnprocessedItems?.[entityName] || [];
          totalInserted += putRequests.length - unprocessed.length;
          putRequests = unprocessed;

          if (putRequests.length > 0) {
            await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempts)));
          }
        } catch (err) {
          errors.push(err.message);
          break;
        }
      }
    }

    return { inserted: totalInserted, errors: errors.length > 0 ? errors : undefined };
  }

  async dropEntity(entityName) {
    await this.connect();
    this.tableKeysCache.delete(entityName);
    return await this.rawClient.send(new DeleteTableCommand({ TableName: entityName }));
  }

  async truncateEntity(entityName) {
    await this.connect();
    // DynamoDB has no TRUNCATE command, easiest and fastest is drop and recreate
    await this.dropEntity(entityName).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    return await this.ensureTableExists(entityName);
  }

  async dropDatabase() {
    throw new Error("DynamoDB does not support dropping an entire AWS account/region database directly.");
  }
}

