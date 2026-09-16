// src/lib/normalizer.js

/**
 * Safely serialize any value so it can be handled across SQL and NoSQL engines
 * without throwing TypeError (e.g. BigInt, circular refs, BSON types, Dates, Buffers).
 */
export function normalizeValue(val) {
  if (val === null || val === undefined) {
    return null;
  }

  // Handle BigInt
  if (typeof val === "bigint") {
    if (val <= BigInt(Number.MAX_SAFE_INTEGER) && val >= BigInt(Number.MIN_SAFE_INTEGER)) {
      return Number(val);
    }
    return val.toString();
  }

  // Handle Dates
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }

  // Handle Buffer or Uint8Array
  if (
    (typeof Buffer !== "undefined" && Buffer.isBuffer(val)) ||
    (typeof Uint8Array !== "undefined" && val instanceof Uint8Array)
  ) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(val).toString("base64");
    }
    return Array.from(new Uint8Array(val))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Handle Mongo ObjectId
  if (typeof val === "object" && val !== null && val._bsontype === "ObjectID") {
    return val.toString();
  }

  // Handle Mongo Decimal128
  if (typeof val === "object" && val !== null && val._bsontype === "Decimal128") {
    return parseFloat(val.toString());
  }

  // Handle Mongo Long
  if (typeof val === "object" && val !== null && val._bsontype === "Long") {
    return val.toString();
  }

  // Handle Arrays
  if (Array.isArray(val)) {
    return val.map((item) => normalizeValue(item));
  }

  // Handle Objects
  if (typeof val === "object") {
    const cleaned = {};
    for (const [k, v] of Object.entries(val)) {
      cleaned[k] = normalizeValue(v);
    }
    return cleaned;
  }

  return val;
}

/**
 * Normalize an entire record (row/document)
 */
export function normalizeRecord(record) {
  if (!record || typeof record !== "object") return {};
  const normalized = {};
  for (const [key, val] of Object.entries(record)) {
    normalized[key] = normalizeValue(val);
  }
  return normalized;
}

/**
 * Sanitize SQL identifier for Postgres, MySQL, or MSSQL
 */
export function quoteIdentifier(name, dialect = "postgres") {
  // strip unwanted characters
  const clean = String(name).replace(/[\0\b\t\n\r\x1a\'"\\]/g, "");
  switch (dialect) {
    case "mysql":
      return `\`${clean.replace(/`/g, "``")}\``;
    case "mssql":
      return `[${clean.replace(/]/g, "]]")}]`;
    case "postgres":
    default:
      return `"${clean.replace(/"/g, '""')}"`;
  }
}

/**
 * Infer SQL data types from sample data rows to allow automatic table creation
 */
export function inferColumnTypes(rows = [], dialect = "postgres") {
  const columnTypeMap = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [col, val] of Object.entries(row)) {
      if (val === null || val === undefined) {
        if (!columnTypeMap.has(col)) {
          columnTypeMap.set(col, "TEXT");
        }
        continue;
      }

      const existing = columnTypeMap.get(col);
      const valType = typeof val;

      if (valType === "boolean") {
        if (!existing || existing === "TEXT") columnTypeMap.set(col, "BOOLEAN");
      } else if (valType === "number") {
        if (Number.isInteger(val)) {
          if (!existing || existing === "TEXT") {
            columnTypeMap.set(col, "BIGINT");
          }
        } else {
          columnTypeMap.set(col, "NUMERIC(18, 4)");
        }
      } else if (Array.isArray(val) || (valType === "object" && !(val instanceof Date))) {
        // Nested structure -> JSON
        columnTypeMap.set(col, dialect === "postgres" ? "JSONB" : dialect === "mysql" ? "JSON" : "NVARCHAR(MAX)");
      } else if (valType === "string") {
        // Check if ISO Date
        if (
          val.length >= 19 &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) &&
          !isNaN(Date.parse(val))
        ) {
          if (!existing || existing === "TEXT") {
            columnTypeMap.set(col, dialect === "mysql" ? "DATETIME" : dialect === "mssql" ? "DATETIME2" : "TIMESTAMPTZ");
          }
        } else if (!existing || existing === "TEXT") {
          columnTypeMap.set(col, "TEXT");
        }
      }
    }
  }

  // Ensure default column if empty
  if (columnTypeMap.size === 0) {
    columnTypeMap.set("id", "TEXT");
    columnTypeMap.set("data", dialect === "postgres" ? "JSONB" : dialect === "mysql" ? "JSON" : "NVARCHAR(MAX)");
  }

  return columnTypeMap;
}

/**
 * Generate DDL CREATE TABLE statement for a specific dialect
 */
export function generateCreateTableSQL(tableName, columnTypeMap, dialect = "postgres") {
  const quotedTable = quoteIdentifier(tableName, dialect);
  const definitions = [];

  let hasPrimaryKey = false;

  for (const [col, type] of columnTypeMap.entries()) {
    const quotedCol = quoteIdentifier(col, dialect);
    let resolvedType = type;

    if (dialect === "mysql") {
      if (type === "TEXT" && (col === "id" || col === "_id")) {
        resolvedType = "VARCHAR(255) PRIMARY KEY";
        hasPrimaryKey = true;
      } else if (type === "BIGINT" && (col === "id" || col === "_id")) {
        resolvedType = "BIGINT PRIMARY KEY";
        hasPrimaryKey = true;
      }
    } else if (dialect === "postgres") {
      if (type === "TEXT" && (col === "id" || col === "_id")) {
        resolvedType = "TEXT PRIMARY KEY";
        hasPrimaryKey = true;
      } else if (type === "BIGINT" && (col === "id" || col === "_id")) {
        resolvedType = "BIGINT PRIMARY KEY";
        hasPrimaryKey = true;
      }
    } else if (dialect === "mssql") {
      if (type === "TEXT" && (col === "id" || col === "_id")) {
        resolvedType = "NVARCHAR(255) PRIMARY KEY";
        hasPrimaryKey = true;
      } else if (type === "TEXT") {
        resolvedType = "NVARCHAR(MAX)";
      }
    }

    definitions.push(`  ${quotedCol} ${resolvedType}`);
  }

  if (dialect === "mysql") {
    return `CREATE TABLE IF NOT EXISTS ${quotedTable} (\n${definitions.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  } else if (dialect === "mssql") {
    return `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${tableName}')\nCREATE TABLE ${quotedTable} (\n${definitions.join(",\n")}\n);`;
  } else {
    // postgres
    return `CREATE TABLE IF NOT EXISTS ${quotedTable} (\n${definitions.join(",\n")}\n);`;
  }
}

