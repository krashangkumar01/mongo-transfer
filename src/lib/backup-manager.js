// src/lib/backup-manager.js
import fs from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import { createDatabaseAdapter, normalizeDbType } from "./db/factory.js";

const BACKUP_DIR = path.join(process.cwd(), "backups");

/**
 * Ensure the backups base directory exists
 */
async function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Mask sensitive credentials from config/uri for storage in manifest
 */
function maskCredentials(config = {}) {
  const masked = { ...config };
  if (masked.password) masked.password = "******";
  if (masked.secretAccessKey) masked.secretAccessKey = "******";
  if (masked.uri) {
    masked.uri = masked.uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:******@");
  }
  return masked;
}

/**
 * Create a full or partial backup of a database into NDJSON/Gzip files
 */
export async function createBackup(dbType, config, entityNames = [], options = {}) {
  await ensureBackupDir();

  const compressed = options.compressed !== false; // default true
  const adapter = await createDatabaseAdapter(dbType, config);
  await adapter.connect();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const backupId = `backup_${normalizeDbType(dbType)}_${timestamp}_${randomSuffix}`;
  const targetFolder = path.join(BACKUP_DIR, backupId);

  await fs.promises.mkdir(targetFolder, { recursive: true });

  const manifest = {
    id: backupId,
    createdAt: new Date().toISOString(),
    dbType: normalizeDbType(dbType),
    config: maskCredentials(config),
    compressed,
    entities: [],
    totalRecords: 0,
    totalSizeBytes: 0,
  };

  try {
    // If no entities specified, backup all
    let targets = entityNames;
    if (!targets || targets.length === 0) {
      const allEntities = await adapter.listEntities();
      targets = allEntities.map((e) => e.name);
    }

    for (const entityName of targets) {
      const filename = `${entityName}.ndjson${compressed ? ".gz" : ""}`;
      const filePath = path.join(targetFolder, filename);

      const fileWriteStream = fs.createWriteStream(filePath);
      let targetStream = fileWriteStream;
      let gzipStream = null;

      if (compressed) {
        gzipStream = zlib.createGzip();
        gzipStream.pipe(fileWriteStream);
        targetStream = gzipStream;
      }

      let offset = 0;
      let entityRecordCount = 0;
      let hasMore = true;
      let cursor = null;

      while (hasMore) {
        const batch = await adapter.readBatch(entityName, {
          limit: 1000,
          offset,
          cursor,
        });

        for (const row of batch.rows) {
          targetStream.write(JSON.stringify(row) + "\n");
          entityRecordCount++;
        }

        hasMore = batch.hasMore && batch.rows.length > 0;
        offset = batch.nextCursor;
        cursor = batch.nextCursor;
      }

      // Finish stream
      await new Promise((resolve, reject) => {
        if (gzipStream) {
          gzipStream.end();
          fileWriteStream.on("finish", resolve);
          fileWriteStream.on("error", reject);
        } else {
          fileWriteStream.end(resolve);
          fileWriteStream.on("error", reject);
        }
      });

      const stats = await fs.promises.stat(filePath);

      manifest.entities.push({
        name: entityName,
        count: entityRecordCount,
        filename,
        sizeBytes: stats.size,
      });

      manifest.totalRecords += entityRecordCount;
      manifest.totalSizeBytes += stats.size;
    }

    // Write manifest.json
    await fs.promises.writeFile(
      path.join(targetFolder, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );

    return { success: true, backupId, manifest };
  } finally {
    await adapter.disconnect();
  }
}

/**
 * List all existing backups stored on the server
 */
export async function listBackups() {
  await ensureBackupDir();
  const entries = await fs.promises.readdir(BACKUP_DIR, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const manifestPath = path.join(BACKUP_DIR, entry.name, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        try {
          const content = await fs.promises.readFile(manifestPath, "utf8");
          const manifest = JSON.parse(content);
          backups.push(manifest);
        } catch {}
      }
    }
  }

  // Sort newest first
  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
}

/**
 * Get details for a specific backup
 */
export async function getBackup(backupId) {
  await ensureBackupDir();
  const manifestPath = path.join(BACKUP_DIR, backupId, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const content = await fs.promises.readFile(manifestPath, "utf8");
  return JSON.parse(content);
}

/**
 * Delete a backup directory
 */
export async function deleteBackup(backupId) {
  await ensureBackupDir();
  // Protect against directory traversal
  const safeId = path.basename(backupId);
  const targetFolder = path.join(BACKUP_DIR, safeId);

  if (fs.existsSync(targetFolder)) {
    await fs.promises.rm(targetFolder, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Restore data from a stored backup to a destination database
 */
export async function restoreBackup(backupId, targetDbType, targetConfig, options = {}) {
  const manifest = await getBackup(backupId);
  if (!manifest) {
    throw new Error(`Backup with ID "${backupId}" not found`);
  }

  const safeId = path.basename(backupId);
  const backupFolder = path.join(BACKUP_DIR, safeId);

  const adapter = await createDatabaseAdapter(targetDbType, targetConfig);
  await adapter.connect();

  const selectedEntities =
    options.entities && options.entities.length > 0
      ? options.entities
      : manifest.entities.map((e) => e.name);

  const results = [];
  let totalRestored = 0;

  try {
    for (const entityMeta of manifest.entities) {
      if (!selectedEntities.includes(entityMeta.name)) continue;

      const filePath = path.join(backupFolder, entityMeta.filename);
      if (!fs.existsSync(filePath)) {
        results.push({
          name: entityMeta.name,
          status: "error",
          message: `Backup file ${entityMeta.filename} not found`,
        });
        continue;
      }

      let readStream = fs.createReadStream(filePath);
      if (manifest.compressed || entityMeta.filename.endsWith(".gz")) {
        const gunzip = zlib.createGunzip();
        readStream = readStream.pipe(gunzip);
      }

      const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity,
      });

      const BATCH_SIZE = options.batchSize || 500;
      let batch = [];
      let entityRestoredCount = 0;
      let isFirstBatch = true;

      for await (const line of rl) {
        if (!line || !line.trim()) continue;
        try {
          const item = JSON.parse(line);
          batch.push(item);
        } catch {}

        if (batch.length >= BATCH_SIZE) {
          const writeRes = await adapter.writeBatch(entityMeta.name, batch, {
            mode: options.mode || "append",
            isFirstBatch,
          });
          isFirstBatch = false;
          entityRestoredCount += writeRes.inserted || batch.length;
          batch = [];
        }
      }

      // Flush remaining
      if (batch.length > 0) {
        const writeRes = await adapter.writeBatch(entityMeta.name, batch, {
          mode: options.mode || "append",
          isFirstBatch,
        });
        entityRestoredCount += writeRes.inserted || batch.length;
      }

      totalRestored += entityRestoredCount;
      results.push({
        name: entityMeta.name,
        status: "done",
        restoredCount: entityRestoredCount,
      });
    }

    return {
      success: true,
      backupId,
      totalRestored,
      results,
    };
  } finally {
    await adapter.disconnect();
  }
}

