// src/app/api/backup/route.js
import { createBackup, listBackups } from "@/lib/backup-manager.js";
import { getFeatureStatus } from "@/lib/features.js";

// GET: list all stored backups
export async function GET() {
  const features = getFeatureStatus();
  if (!features.backup) {
    return Response.json(
      {
        success: false,
        message: "The Backup feature is currently disabled via environment configuration (ENABLE_BACKUP=false).",
      },
      { status: 403 }
    );
  }

  try {
    const backups = await listBackups();
    return Response.json({ success: true, backups });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST: create a new backup
export async function POST(req) {
  const features = getFeatureStatus();
  if (!features.backup) {
    return Response.json(
      {
        success: false,
        message: "The Backup feature is currently disabled via environment configuration (ENABLE_BACKUP=false).",
      },
      { status: 403 }
    );
  }

  try {
    const { dbType, config, entities, options } = await req.json();
    if (!dbType || !config) {
      return Response.json(
        { success: false, message: "Database type and connection config are required." },
        { status: 400 }
      );
    }

    const result = await createBackup(dbType, config, entities || [], options || {});
    return Response.json(result);
  } catch (err) {
    console.error("Backup creation error:", err);
    return Response.json(
      { success: false, message: err.message || "Failed to create backup" },
      { status: 500 }
    );
  }
}
