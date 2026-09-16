// src/app/api/db/entities/route.js
import { createDatabaseAdapter } from "@/lib/db/factory.js";

export async function POST(req) {
  let adapter = null;
  try {
    const { dbType, config } = await req.json();
    if (!dbType) {
      return Response.json({ success: false, message: "Database type is required" }, { status: 400 });
    }

    adapter = await createDatabaseAdapter(dbType, config || {});
    const entities = await adapter.listEntities();

    return Response.json({
      success: true,
      entities,
      totalEntities: entities.length,
    });
  } catch (err) {
    console.error("Fetch entities error:", err);
    return Response.json({
      success: false,
      message: err.message || "Failed to list database entities",
    }, { status: 500 });
  } finally {
    if (adapter) {
      await adapter.disconnect().catch(() => {});
    }
  }
}

