// app/api/transfer/route.js
import mongoose from "mongoose";

export async function POST(req) {
  try {
    const { sourceDB, destDB, collections } = await req.json();

    if (!sourceDB || !destDB)
      return Response.json({ error: true, message: "Missing database URLs" });

    const sourceConn = await mongoose.createConnection(sourceDB);
    const destConn = await mongoose.createConnection(destDB);

    const results = [];

    for (const col of collections) {
      const result = { name: col, status: "processing", count: 0 };
      results.push(result);

      const Source = sourceConn.model(col, new mongoose.Schema({}, { strict: false }), col);
      const Dest = destConn.model(col, new mongoose.Schema({}, { strict: false }), col);

      const docs = await Source.find().lean();
      result.count = docs.length;

      if (docs.length === 0) {
        result.status = "empty";
        continue;
      }

      await Dest.insertMany(docs);
      result.status = "done";
    }

    await sourceConn.close();
    await destConn.close();

    return Response.json({ success: true, results });
  } catch (error) {
    console.error(error);
    return Response.json({ error: true, message: error.message });
  }
}
