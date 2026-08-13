"use client";
import { useState } from "react";

export default function Home() {
  const [sourceDB, setSourceDB] = useState("");
  const [destDB, setDestDB] = useState("");
  const [collections, setCollections] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fetchCollections = async () => {
    if (!sourceDB) return alert("Enter Source DB URL first");
    setFetching(true);

    try {
      const res = await fetch("/api/getCollections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbUri: sourceDB }),
      });
      const data = await res.json();

      if (data.success) {
        // default select all
        setCollections(data.collections.map((name) => ({ name, selected: true })));
      } else {
        alert("Error: " + (data.message || "Unknown"));
      }
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setFetching(false);
    }
  };

  const handleCheckboxChange = (name) => {
    setCollections((prev) =>
      prev.map((c) => (c.name === name ? { ...c, selected: !c.selected } : c))
    );
  };

  const selectAll = () => {
    setCollections((prev) => prev.map((c) => ({ ...c, selected: true })));
  };

  const deselectAll = () => {
    setCollections((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const handleTransfer = async () => {
    const selected = collections.filter((c) => c.selected).map((c) => c.name);
    if (!sourceDB || !destDB || selected.length === 0) {
      alert("Please enter both DB URLs and select at least one collection!");
      return;
    }

    setLoading(true);
    setProgress(5);
    setStatuses({});

    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDB, destDB, collections: selected }),
      });

      const data = await res.json();

      if (data.success) {
        // animate results in a professional sequential manner
        const total = data.results.length;
        data.results.forEach((col, i) => {
          setTimeout(() => {
            setStatuses((prev) => ({
              ...prev,
              [col.name]: { status: col.status, message: col.message || "", count: col.count || 0 },
            }));
            setProgress(Math.round(((i + 1) / total) * 100));
          }, i * 450);
        });

        // ensure loading cleared after done
        setTimeout(() => {
          setLoading(false);
          setProgress(100);
        }, total * 480 + 200);
      } else {
        alert("Error: " + (data.message || "Unknown"));
        setLoading(false);
      }
    } catch (err) {
      alert("Failed: " + err.message);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "done":
        return "bg-green-100 text-green-700 border-green-300";
      case "processing":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "empty":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "error":
        return "bg-red-100 text-red-700 border-red-300";
      default:
        return "bg-gray-100 text-gray-500 border-gray-200";
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 p-6">
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-xl shadow-2xl rounded-3xl p-8 border border-gray-200">
        <h1 className="text-3xl font-extrabold text-center text-indigo-700 mb-8">
          MongoDB Atlas Transfer Tool 🚀
        </h1>

        {/* Input Fields */}
        <div className="space-y-4">
          {/* Source DB */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Source DB URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sourceDB}
                onChange={(e) => setSourceDB(e.target.value)}
                className="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400"
                placeholder="mongodb+srv://..."
              />
              <button
                onClick={fetchCollections}
                disabled={fetching}
                className={`px-4 py-2 rounded-xl text-white font-semibold ${
                  fetching ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {fetching ? "Fetching..." : "Fetch Collections"}
              </button>
            </div>
          </div>

          {/* Destination DB */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Destination DB URL</label>
            <input
              type="text"
              value={destDB}
              onChange={(e) => setDestDB(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-400"
              placeholder="mongodb+srv://..."
            />
          </div>
        </div>

        {/* Collection List */}
        {collections.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-700">Select Collections</h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1 rounded-md bg-indigo-50 text-indigo-700 text-sm hover:bg-indigo-100"
                >
                  Select all
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 rounded-md bg-gray-50 text-gray-700 text-sm hover:bg-gray-100"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
              {collections.map((col) => (
                <label
                  key={col.name}
                  className={`flex items-center space-x-2 p-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition ${
                    col.selected ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={col.selected}
                    onChange={() => handleCheckboxChange(col.name)}
                  />
                  <span className="font-medium text-gray-700">{col.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Transfer Button */}
        {collections.length > 0 && (
          <button
            onClick={handleTransfer}
            disabled={loading}
            className={`mt-8 w-full py-3 rounded-xl font-semibold text-white transition ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {loading ? "Processing..." : "Start Transfer"}
          </button>
        )}

        {/* Progress */}
        {loading && (
          <div className="mt-6">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-3 bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-gray-600 mt-2">{progress}% completed</p>
          </div>
        )}

        {/* Status */}
        <div className="mt-8 grid grid-cols-1 gap-3">
          {collections
            .filter((c) => c.selected)
            .map((col) => {
              const s = statuses[col.name];
              const statusKey = s ? s.status : undefined;

              return (
                <div
                  key={col.name}
                  className={`flex flex-col sm:flex-row sm:justify-between items-start sm:items-center border rounded-lg px-4 py-3 ${getStatusColor(
                    statusKey
                  )}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{col.name}</span>
                    {s && s.count > 0 && (
                      <span className="text-xs text-gray-500">{s.count} docs</span>
                    )}
                  </div>

                  <div className="mt-2 sm:mt-0 text-sm text-right">
                    {s ? (
                      s.status === "done" ? (
                        <span className="inline-flex items-center">✅ Done</span>
                      ) : s.status === "empty" ? (
                        <span className="inline-flex items-center">⚠️ Empty</span>
                      ) : s.status === "processing" ? (
                        <span className="inline-flex items-center">⏳ Processing</span>
                      ) : s.status === "error" ? (
                        <div className="text-red-700">
                          <div>❌ Error</div>
                          {s.message && <div className="text-xs text-red-600 mt-1">{s.message}</div>}
                        </div>
                      ) : (
                        <span>Pending</span>
                      )
                    ) : (
                      <span>Pending</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
