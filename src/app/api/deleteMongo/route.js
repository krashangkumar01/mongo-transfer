import { MongoClient } from "mongodb";
import { getFeatureStatus } from "@/lib/features.js";

export async function POST(req) {
  const features = getFeatureStatus();
  if (!features.delete) {
    return Response.json(
      { error: true, message: "The Delete feature is currently disabled via environment configuration (ENABLE_DELETE=false)." },
      { status: 403 }
    );
  }
  try {
    const { dbUri, target, name } = await req.json();

    if (!dbUri || !target) {
      return Response.json(
        { error: true, message: "Missing dbUri or target" },
        { status: 400 }
      );
    }

    const client = new MongoClient(dbUri);
    await client.connect();

    // Extract DB name from URI
    let dbName = new URL(dbUri).pathname.replace("/", "").trim();
    if (!dbName) dbName = "test";

    const db = client.db(dbName);

    let resultMessage = "";

    if (target === "collection") {
      if (!name)
        return Response.json(
          { error: true, message: "Collection name required" },
          { status: 400 }
        );

      const collections = await db.listCollections({ name }).toArray();
      if (collections.length === 0) {
        resultMessage = `Collection "${name}" does not exist.`;
      } else {
        await db.collection(name).drop();
        resultMessage = `Collection "${name}" deleted successfully.`;
      }
    } else if (target === "database") {
      await db.dropDatabase();
      resultMessage = `Database "${dbName}" deleted successfully.`;
    } else {
      return Response.json(
        { error: true, message: "Invalid target value" },
        { status: 400 }
      );
    }

    await client.close();

    return Response.json({ success: true, message: resultMessage });
  } catch (error) {
    console.error("❌ Delete Error:", error);
    return Response.json({ error: true, message: error.message });
  }
}
