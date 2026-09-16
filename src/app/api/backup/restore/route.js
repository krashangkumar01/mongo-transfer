// src/app/api/backup/restore/route.js
import { restoreBackup } from "@/lib/backup-manager.js";
import { getFeatureStatus } from "@/lib/features.js";

export async function POST(req) {
  const features = getFeatureStatus();
  if (!features.backup) {
    return Response.json(
      {
        success: false,
        message: "The Backup & Restore feature is currently disabled via environment configuration (ENABLE_BACKUP=false).",
      },
      { status: 403 }
    );
  }

  try {
    const { backupId, targetDbType, targetConfig, options } = await req.json();

    if (!backupId || !targetDbType || !targetConfig) {
      return Response.json(
        { success: false, message: "Backup ID, target DB type, and target config are required." },
        { status: 400 }
      );
    }

    const result = await restoreBackup(backupId, targetDbType, targetConfig, options || {});
    return Response.json(result);
  } catch (err) {
    console.error("Backup restore error:", err);
    return Response.json(
      { success: false, message: err.message || "Failed to restore backup" },
      { status: 500 }
    );
  }
}
