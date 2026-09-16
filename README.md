# ⚡ Data Manager - Universal Database Migration, Backup & Management Engine

A high-performance, universal multi-database management platform for transferring, converting, and taking snapshot backups across **PostgreSQL, MySQL, Microsoft SQL Server (MSSQL), Amazon DynamoDB, and MongoDB**.

---

## 🌟 Key Features

- **Any-to-Any Database Transfer**:
  - Relational to Relational (e.g. PostgreSQL $\leftrightarrow$ MySQL, SQL Server $\leftrightarrow$ PostgreSQL)
  - Document to Document (e.g. MongoDB $\leftrightarrow$ Amazon DynamoDB)
  - Heterogeneous SQL $\leftrightarrow$ NoSQL migrations (e.g. MongoDB $\rightarrow$ PostgreSQL, MySQL $\rightarrow$ MongoDB, SQL Server $\rightarrow$ DynamoDB)
- **Automatic Schema Inference & DDL Generation**:
  - Automatically creates destination tables with inferred SQL types (`JSONB`, `JSON`, `VARCHAR`, `BIGINT`, `TIMESTAMPTZ`, etc.) when destination tables do not yet exist.
- **🛡️ Pre-Transfer Snapshot Backups**:
  - Safely creates a compressed NDJSON / Gzip (`.ndjson.gz`) snapshot backup of the destination or source database before executing migrations.
- **💾 Dedicated Backup & Restore Hub**:
  - Export full or partial table/collection backups.
  - Stored backup history library with one-click download (`.tar.gz`) and cross-database restoration.
- **🗑️ Universal Database Cleaner**:
  - Drop or truncate tables/collections or drop entire databases with safeguards and double-confirmation.
- **⚙️ Feature Toggles via Environment Variables**:
  - Individually enable or disable Transfer, Backup, and Delete capabilities via `.env.local`.
- **🔌 Built-in Connection Tester**:
  - Instant ping, server version discovery, and latency measurement for all 5 database engines.

---

## 🚀 Supported Databases

| Icon | Database | Engine Type | Default Port | Connection Options |
| :--- | :--- | :--- | :--- | :--- |
| 🐘 | **PostgreSQL** | Relational / SQL | `5432` | Connection URI or Host, Port, DB, User, Pass, SSL |
| 🐬 | **MySQL** | Relational / SQL | `3306` | Connection URI or Host, Port, DB, User, Pass, SSL |
| 🪟 | **SQL Server (MSSQL)** | Relational / SQL | `1433` | Connection String or Server, Port, DB, User, Pass, Encrypt |
| ⚡ | **Amazon DynamoDB** | Document / NoSQL | `8000` (local) | Region, Access Key, Secret Key, Session Token, Custom Endpoint |
| 🍃 | **MongoDB** | Document / NoSQL | `27017` | Connection URI (`mongodb://`, `mongodb+srv://`) or discrete fields |

---

## 🔧 Environment Configuration & Feature Toggles

Control feature availability via `.env.local` or deployment environment variables:

```bash
# =======================================================
# Data Manager Feature Toggles (true = enabled, false = disabled)
# =======================================================

# Enable/disable Transfer Engine
ENABLE_TRANSFER=true
NEXT_PUBLIC_ENABLE_TRANSFER=true

# Enable/disable Backup & Restore Hub
ENABLE_BACKUP=true
NEXT_PUBLIC_ENABLE_BACKUP=true

# Enable/disable Database Cleaner & Delete Tool
ENABLE_DELETE=true
NEXT_PUBLIC_ENABLE_DELETE=true
```

When a feature is set to `false`:
- The corresponding navigation tab reflects the disabled status.
- Dedicated user-facing warning banners are rendered in the UI.
- All associated API routes (`/api/transfer`, `/api/backup`, `/api/db/manage`) reject requests with HTTP `403 Forbidden`.

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Production Build
```bash
npm run build
npm run start
```

---

## 👨‍💻 Developer & Author

Developed with ❤️ by **[Krashang Kumar](https://www.linkedin.com/in/krashang-kumar)**

- **LinkedIn**: [krashang-kumar](https://www.linkedin.com/in/krashang-kumar)
- **Project**: Data Manager - Universal Multi-Database Transfer & Backup Engine
