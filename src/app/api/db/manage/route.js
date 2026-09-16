// src/app/api/db/manage/route.js
import { createDatabaseAdapter } from "@/lib/db/factory.js";
import { getFeatureStatus } from "@/lib/features.js";

export async function POST(req) {
  const features = getFeatureStatus();
  if (!features.delete) {
    return Response.json(
      {
        success: false,
        message: "The Database Cleaner & Delete feature is currently disabled via environment configuration (ENABLE_DELETE=false).",
      },
      { status: 403 }
    );
  }

  let adapter = null;
  try {
    const { dbType, config, action, entityName, target, name } = await req.json();

    // Support legacy parameters (target: 'collection' | 'database', name)
    const effectiveAction = action || (target === "database" ? "drop_database" : "drop_entity");
    const effectiveEntity = entityName || name;
    const effectiveType = dbType || "mongodb";

    adapter = await createDatabaseAdapter(effectiveType, config || {});
    await adapter.connect();

    let message = "";

    if (effectiveAction === "drop_entity") {
      if (!effectiveEntity) {
        return Response.json({ success: false, message: "Entity name is required" }, { status: 400 });
      }
      await adapter.dropEntity(effectiveEntity);
      message = `Successfully dropped ${effectiveEntity}.`;
    } else if (effectiveAction === "truncate_entity") {
      if (!effectiveEntity) {
        return Response.json({ success: false, message: "Entity name is required" }, { status: 400 });
      }
      await adapter.truncateEntity(effectiveEntity);
      message = `Successfully truncated ${effectiveEntity}.`;
    } else if (effectiveAction === "drop_database") {
      await adapter.dropDatabase();
      message = `Successfully dropped database.`;
    } else {
      return Response.json({ success: false, message: `Unknown action "${effectiveAction}"` }, { status: 400 });
    }

    return Response.json({ success: true, message });
  } catch (err) {
    console.error("Database manage error:", err);
    return Response.json({ success: false, message: err.message || "Operation failed" }, { status: 500 });
  } finally {
    if (adapter) {
      await adapter.disconnect().catch(() => {});
    }
  }
}
