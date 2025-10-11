// ✅ Use native MongoDB driver instead of Mongoose
import { MongoClient } from "mongodb";

export async function POST(req) {
  try {
    const { dbUri } = await req.json();
    if (!dbUri) {
      return Response.json({ error: true, message: "Missing database URI" }, { status: 400 });
    }

    // Create client and connect
    const client = new MongoClient(dbUri);
    await client.connect();

    // Extract DB name from URI (e.g. ...mongodb.net/myDatabase)
    let dbName = new URL(dbUri).pathname.replace("/", "").trim();
    if (!dbName) dbName = "test"; // default fallback

    const db = client.db(dbName);

    // ✅ Fetch collection list
    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name);

    // Close connection
    await client.close();

    return Response.json({ success: true, collections: names });
  } catch (error) {
    console.error("❌ getCollections error:", error);
    return Response.json({ error: true, message: error.message });
  }
}
