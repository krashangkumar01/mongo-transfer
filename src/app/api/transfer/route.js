// app/api/transfer/route.js
import mongoose from "mongoose";

export async function POST(req) {
  try {
    const { sourceDB, destDB, collections } = await req.json();

    if (!sourceDB || !destDB)
      return Response.json({ error: true, message: "Missing database URLs" }, { status: 400 });

    // Create connections
    const sourceConn = await mongoose.createConnection(sourceDB);
    const destConn = await mongoose.createConnection(destDB);

    const results = [];

    try {
      for (const col of collections) {
        const result = { name: col, status: "processing", count: 0 };
        results.push(result);

        try {
          const Source = sourceConn.model(col, new mongoose.Schema({}, { strict: false }), col);
          const Dest = destConn.model(col, new mongoose.Schema({}, { strict: false }), col);

          // fetch docs (lean for performance)
          const docs = await Source.find().lean().exec();
          result.count = docs.length;

          if (docs.length === 0) {
            result.status = "empty";
            continue;
          }

          // Insert in batches to avoid memory spikes for very large collections
          const BATCH_SIZE = 500;
          for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const batch = docs.slice(i, i + BATCH_SIZE);
            await Dest.insertMany(batch);
          }

          result.status = "done";
        } catch (colErr) {
          // capture per-collection error and continue with others
          console.error(`Error processing collection ${col}:`, colErr);
          result.status = "error";
          result.message = colErr.message || String(colErr);
        }
      }
    } finally {
      // always close connections
      await sourceConn.close().catch(() => {});
      await destConn.close().catch(() => {});
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("Transfer handler error:", error);
    return Response.json({ error: true, message: error.message || "Unknown error" }, { status: 500 });
  }
}
