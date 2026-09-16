// src/app/api/backup/[id]/route.js
import fs from "fs";
import path from "path";
import * as tar from "tar";
import { getBackup, deleteBackup } from "@/lib/backup-manager.js";
import { getFeatureStatus } from "@/lib/features.js";

const BACKUP_DIR = path.join(process.cwd(), "backups");

// GET: Download backup archive
export async function GET(req, { params }) {
  const features = getFeatureStatus();
  if (!features.backup) {
    return new Response("Backup feature is disabled via environment configuration (ENABLE_BACKUP=false).", { status: 403 });
  }

  try {
    const { id } = await params;
    const safeId = path.basename(id);
    const backupFolder = path.join(BACKUP_DIR, safeId);

    if (!fs.existsSync(backupFolder)) {
      return new Response("Backup not found", { status: 404 });
    }

    const files = await fs.promises.readdir(backupFolder);

    // Stream a tar.gz archive directly to the client
    const tarStream = tar.c(
      {
        gzip: true,
        cwd: backupFolder,
      },
      files
    );

    // Convert node stream to web readable stream
    const readable = new ReadableStream({
      start(controller) {
        tarStream.on("data", (chunk) => controller.enqueue(chunk));
        tarStream.on("end", () => controller.close());
        tarStream.on("error", (err) => controller.error(err));
      },
    });

    const archiveFilename = `${safeId}.tar.gz`;

    return new Response(readable, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${archiveFilename}"`,
      },
    });
  } catch (err) {
    console.error("Backup download error:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

// DELETE: Delete a backup
export async function DELETE(req, { params }) {
  const features = getFeatureStatus();
  if (!features.backup) {
    return Response.json(
      { success: false, message: "Backup feature is disabled via environment configuration (ENABLE_BACKUP=false)." },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const safeId = path.basename(id);
    const deleted = await deleteBackup(safeId);

    if (!deleted) {
      return Response.json({ success: false, message: "Backup not found" }, { status: 404 });
    }

    return Response.json({ success: true, message: `Backup "${safeId}" deleted successfully.` });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
