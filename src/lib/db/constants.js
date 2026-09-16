// src/lib/db/constants.js

export const SUPPORTED_DATABASES = [
  {
    id: "mongodb",
    name: "MongoDB",
    category: "nosql",
    icon: "🍃",
    defaultPort: 27017,
    uriPlaceholder: "mongodb+srv://user:pass@cluster.mongodb.net/database",
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "sql",
    icon: "🐘",
    defaultPort: 5432,
    uriPlaceholder: "postgresql://user:pass@localhost:5432/dbname?sslmode=disable",
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "sql",
    icon: "🐬",
    defaultPort: 3306,
    uriPlaceholder: "mysql://user:pass@localhost:3306/dbname",
  },
  {
    id: "mssql",
    name: "SQL Server (MSSQL)",
    category: "sql",
    icon: "🪟",
    defaultPort: 1433,
    uriPlaceholder: "Server=localhost,1433;Database=master;User Id=sa;Password=your_password;Encrypt=true;TrustServerCertificate=true;",
  },
  {
    id: "dynamodb",
    name: "Amazon DynamoDB",
    category: "nosql",
    icon: "⚡",
    defaultPort: 8000,
    uriPlaceholder: "http://localhost:8000 (optional endpoint for local/localstack)",
  },
];

/**
 * Normalize database type string
 */
export function normalizeDbType(type = "") {
  const t = String(type).toLowerCase().trim();
  if (t === "postgres" || t === "postgresql" || t === "pg") return "postgresql";
  if (t === "mysql" || t === "mariadb") return "mysql";
  if (t === "mssql" || t === "sqlserver" || t === "sql_server") return "mssql";
  if (t === "dynamodb" || t === "dynamo" || t === "aws-dynamodb") return "dynamodb";
  if (t === "mongo" || t === "mongodb") return "mongodb";
  return t;
}

