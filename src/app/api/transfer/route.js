// src/app/api/transfer/route.js
import { createDatabaseAdapter } from "@/lib/db/factory.js";
import { createBackup } from "@/lib/backup-manager.js";
import { getFeatureStatus } from "@/lib/features.js";

export async function POST(req) {
  // Check feature flag
  const features = getFeatureStatus();
  if (!features.transfer) {
    return Response.json(
      {
        success: false,
        message: "The Transfer feature is currently disabled via environment configuration (ENABLE_TRANSFER=false).",
      },
      { status: 403 }
    );
  }

  let sourceAdapter = null;
  let destAdapter = null;

  try {
    const body = await req.json();

    // Check if legacy payload or universal payload
    let source = body.source;
    let destination = body.destination;
    let entities = body.entities || body.collections || [];
    let options = body.options || {};

    // Support legacy schema: { sourceDB, destDB, collections }
    if (!source && body.sourceDB) {
      source = { dbType: "mongodb", config: { uri: body.sourceDB } };
    }
    if (!destination && body.destDB) {
      destination = { dbType: "mongodb", config: { uri: body.destDB } };
    }

    if (!source || !destination || !entities || entities.length === 0) {
      return Response.json(
        { success: false, message: "Source DB, Destination DB, and at least one entity are required." },
        { status: 400 }
      );
    }

    const {
      mode = "append", // 'append' | 'truncate' | 'overwrite'
      batchSize = 500,
      backupBeforeTransfer = false,
      backupTarget = "destination", // 'destination' | 'source' | 'both'
    } = options;

    let backupResult = null;

    // 1. Pre-transfer snapshot backup if requested
    if (backupBeforeTransfer) {
      try {
        if (backupTarget === "destination" || backupTarget === "both") {
          backupResult = await createBackup(
            destination.dbType,
            destination.config,
            entities,
            { compressed: true }
          );
        } else if (backupTarget === "source") {
          backupResult = await createBackup(
            source.dbType,
            source.config,
            entities,
            { compressed: true }
          );
        }
      } catch (backupErr) {
        console.warn("Pre-transfer backup warning:", backupErr.message);
        backupResult = {
          success: false,
          warning: `Pre-transfer backup failed: ${backupErr.message}`,
        };
      }
    }

    // 2. Initialize adapters
    sourceAdapter = await createDatabaseAdapter(source.dbType, source.config);
    destAdapter = await createDatabaseAdapter(destination.dbType, destination.config);

    await sourceAdapter.connect();
    await destAdapter.connect();

    const results = [];

    // 3. Process each entity
    for (const entityName of entities) {
      const result = {
        name: entityName,
        status: "processing",
        count: 0,
        readCount: 0,
        insertedCount: 0,
      };
      results.push(result);

      try {
        let offset = 0;
        let hasMore = true;
        let cursor = null;
        let isFirstBatch = true;
        let totalRead = 0;
        let totalInserted = 0;

        while (hasMore) {
          const batch = await sourceAdapter.readBatch(entityName, {
            limit: Number(batchSize),
            offset,
            cursor,
          });

          const rows = batch.rows || [];
          totalRead += rows.length;

          if (rows.length > 0) {
            const writeRes = await destAdapter.writeBatch(entityName, rows, {
              mode,
              isFirstBatch,
            });
            isFirstBatch = false;
            totalInserted += writeRes.inserted || rows.length;
          }

          hasMore = batch.hasMore && rows.length > 0;
          offset = batch.nextCursor;
          cursor = batch.nextCursor;
        }

        result.readCount = totalRead;
        result.insertedCount = totalInserted;
        result.count = totalRead;

        if (totalRead === 0) {
          result.status = "empty";
          result.message = "Source entity has 0 records.";
        } else {
          result.status = "done";
          result.message = `Successfully transferred ${totalInserted} of ${totalRead} records.`;
        }
      } catch (entityErr) {
        console.error(`Error transferring entity ${entityName}:`, entityErr);
        result.status = "error";
        result.message = entityErr.message || String(entityErr);
      }
    }

    return Response.json({
      success: true,
      results,
      backup: backupResult,
    });
  } catch (err) {
    console.error("Transfer handler error:", err);
    return Response.json(
      { success: false, message: err.message || "Internal transfer error" },
      { status: 500 }
    );
  } finally {
    if (sourceAdapter) await sourceAdapter.disconnect().catch(() => {});
    if (destAdapter) await destAdapter.disconnect().catch(() => {});
  }
}
