"use client";
import { useState } from "react";

export default function DeleteMongoPage() {
  const [dbUri, setDbUri] = useState("");
  const [collections, setCollections] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [deleteDB, setDeleteDB] = useState(false);

  // Fetch collections from Mongo URI
  const fetchCollections = async () => {
    if (!dbUri) return alert("Enter MongoDB URI first!");
    setFetching(true);
    setCollections([]);
    setStatus("");

    try {
      const res = await fetch("/api/getCollections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbUri }),
      });
      const data = await res.json();
      if (data.success) {
        setCollections(data.collections.map((name) => ({ name, selected: false })));
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setFetching(false);
    }
  };

  // Handle checkbox toggle
  const toggleCollection = (name) => {
    setCollections((prev) =>
      prev.map((c) => (c.name === name ? { ...c, selected: !c.selected } : c))
    );
  };

  // Delete selected collections or entire DB
  const handleDelete = async () => {
    if (!dbUri) return alert("Enter MongoDB URI first!");

    let targets = [];
    if (deleteDB) {
      if (!confirm("Are you sure you want to DELETE the ENTIRE DATABASE?")) return;
      targets = [{ target: "database" }];
    } else {
      targets = collections.filter((c) => c.selected).map((c) => ({ target: "collection", name: c.name }));
      if (targets.length === 0) return alert("Select at least one collection to delete!");
      if (!confirm(`Are you sure you want to delete ${targets.length} collection(s)?`)) return;
    }

    setLoading(true);
    setStatus("");

    for (let t of targets) {
      try {
        const res = await fetch("/api/deleteMongo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dbUri, ...t }),
        });
        const data = await res.json();
        setStatus((prev) => prev + data.message + "\n");
      } catch (err) {
        setStatus((prev) => prev + `Error deleting ${t.name || "DB"}: ${err.message}\n`);
      }
    }

    setLoading(false);
    // Refresh collections if DB was not deleted
    if (!deleteDB) fetchCollections();
    else setCollections([]);
  };

  return (
    <div className="min-h-screen flex justify-center items-start bg-gradient-to-br from-red-100 via-pink-100 to-purple-100 p-6">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-xl shadow-2xl rounded-3xl p-8 border border-gray-200">
        <h1 className="text-3xl font-extrabold text-center text-red-700 mb-6">
          MongoDB Delete Tool 🗑️
        </h1>

        {/* Mongo URI */}
        <div className="mb-4">
          <label className="block font-medium text-gray-700 mb-1">MongoDB URI</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dbUri}
              onChange={(e) => setDbUri(e.target.value)}
              placeholder="mongodb+srv://user:pass@cluster.mongodb.net/myDB"
              className="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400"
            />
            <button
              onClick={fetchCollections}
              disabled={fetching}
              className={`px-4 py-2 rounded-xl text-white font-semibold ${
                fetching ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {fetching ? "Fetching..." : "Fetch Collections"}
            </button>
          </div>
        </div>

        {/* Delete DB Option */}
        <div className="mb-4 flex items-center space-x-2">
          <input
            type="checkbox"
            checked={deleteDB}
            onChange={() => setDeleteDB(!deleteDB)}
          />
          <span className="font-medium text-gray-700">
            Delete Entire Database
          </span>
        </div>

        {/* Collections List */}
        {!deleteDB && collections.length > 0 && (
          <div className="mb-4">
            <h2 className="font-semibold text-gray-700 mb-2">Collections</h2>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto border rounded-lg p-2 bg-gray-50">
              {collections.map((c) => (
                <label key={c.name} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => toggleCollection(c.name)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          disabled={loading || (!deleteDB && collections.length === 0)}
          className={`w-full py-3 rounded-xl font-semibold text-white transition ${
            loading ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {loading ? "Deleting..." : "Delete"}
        </button>

        {/* Status Output */}
        {status && (
          <pre className="mt-4 p-4 bg-gray-100 rounded-lg text-sm whitespace-pre-wrap">
            {status}
          </pre>
        )}
      </div>
    </div>
  );
}
