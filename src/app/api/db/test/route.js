// src/app/api/db/test/route.js
import { createDatabaseAdapter } from "@/lib/db/factory.js";

export async function POST(req) {
  let adapter = null;
  try {
    const { dbType, config } = await req.json();
    if (!dbType) {
      return Response.json({ success: false, message: "Database type is required" }, { status: 400 });
    }

    adapter = await createDatabaseAdapter(dbType, config || {});
    const result = await adapter.testConnection();

    return Response.json(result);
  } catch (err) {
    return Response.json({
      success: false,
      message: err.message || "Failed to test connection",
    }, { status: 500 });
  } finally {
    if (adapter) {
      await adapter.disconnect().catch(() => {});
    }
  }
}

