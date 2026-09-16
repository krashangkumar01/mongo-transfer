// src/app/delete/page.jsx
"use client";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import DbConnectionForm from "@/components/DbConnectionForm";

export default function DeletePage() {
  const [dbState, setDbState] = useState({
    dbType: "mongodb",
    config: { uri: "" },
  });

  const [entities, setEntities] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [operationLog, setOperationLog] = useState("");
  const [deleteEnabled, setDeleteEnabled] = useState(
    process.env.NEXT_PUBLIC_ENABLE_DELETE !== "false"
  );

  useEffect(() => {
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.features) {
          setDeleteEnabled(data.features.delete);
        }
      })
      .catch(() => {});
  }, []);

  // Operation selection: 'drop_entities' | 'truncate_entities' | 'drop_database'
  const [actionType, setActionType] = useState("drop_entities");

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setOperationLog((prev) => prev + `[${time}] ${msg}\n`);
  };

  const fetchEntities = async () => {
    setFetching(true);
    setEntities([]);
    addLog(`Connecting to ${dbState.dbType} to list tables/collections...`);

    try {
      const res = await fetch("/api/db/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbType: dbState.dbType,
          config: dbState.config,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEntities(
          data.entities.map((e) => ({
            name: e.name,
            type: e.type,
            count: e.count || 0,
            selected: false,
          }))
        );
        addLog(`Found ${data.entities.length} tables/collections.`);
      } else {
        alert("Error: " + data.message);
        addLog(`Fetch failed: ${data.message}`);
      }
    } catch (err) {
      alert("Failed to connect: " + err.message);
      addLog(`Fetch error: ${err.message}`);
    } finally {
      setFetching(false);
    }
  };

  const toggleEntity = (name) => {
    setEntities((prev) =>
      prev.map((e) => (e.name === name ? { ...e, selected: !e.selected } : e))
    );
  };

  const selectAll = () => {
    setEntities((prev) => prev.map((e) => ({ ...e, selected: true })));
  };

  const deselectAll = () => {
    setEntities((prev) => prev.map((e) => ({ ...e, selected: false })));
  };

  const handleExecute = async () => {
    if (actionType === "drop_database") {
      const confirmed = prompt(
        `DANGER: You are about to DROP the ENTIRE DATABASE (${dbState.dbType}).\nType "DELETE" in capital letters to confirm:`
      );
      if (confirmed !== "DELETE") {
        return alert("Database drop cancelled.");
      }

      setLoading(true);
      addLog(`Executing: DROP DATABASE on ${dbState.dbType}...`);

      try {
        const res = await fetch("/api/db/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dbType: dbState.dbType,
            config: dbState.config,
            action: "drop_database",
          }),
        });
        const data = await res.json();
        if (data.success) {
          addLog(`Success: ${data.message}`);
          setEntities([]);
        } else {
          addLog(`Error: ${data.message}`);
        }
      } catch (err) {
        addLog(`Exception: ${err.message}`);
      } finally {
        setLoading(false);
      }
      return;
    }

    const selectedEntities = entities.filter((e) => e.selected);
    if (selectedEntities.length === 0) {
      return alert("Please select at least one table or collection!");
    }

    const actionWord = actionType === "truncate_entities" ? "TRUNCATE (empty)" : "DROP (delete table)";
    if (
      !confirm(
        `Are you sure you want to ${actionWord} ${selectedEntities.length} item(s)? This action cannot be undone.`
      )
    ) {
      return;
    }

    setLoading(true);
    const op = actionType === "truncate_entities" ? "truncate_entity" : "drop_entity";

    for (const item of selectedEntities) {
      addLog(`Executing ${op} on "${item.name}"...`);
      try {
        const res = await fetch("/api/db/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dbType: dbState.dbType,
            config: dbState.config,
            action: op,
            entityName: item.name,
          }),
        });
        const data = await res.json();
        if (data.success) {
          addLog(`Success: ${data.message}`);
        } else {
          addLog(`Failed on ${item.name}: ${data.message}`);
        }
      } catch (err) {
        addLog(`Error on ${item.name}: ${err.message}`);
      }
    }

    setLoading(false);
    // Refresh entity list
    fetchEntities();
  };

  const selectedCount = entities.filter((e) => e.selected).length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-tr from-orange-600 via-amber-500 to-sky-500 rounded-2xl shadow-lg shadow-orange-500/20">
              <span className="text-xl">🗑️</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Universal Database Cleaner & Maintenance
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Drop or truncate tables, collections, and databases across PostgreSQL, MySQL, SQL Server, DynamoDB, and MongoDB.
              </p>
            </div>
          </div>
        </div>

        {/* Feature Disabled Banner */}
        {!deleteEnabled && (
          <div className="bg-orange-950/30 border border-orange-500/40 rounded-2xl p-5 flex items-center gap-4 text-orange-200">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-orange-300">Database Cleaner Feature is Disabled</h3>
              <p className="text-xs text-orange-400/80 mt-0.5">
                Destructive operations (drop and truncate) have been disabled by the administrator via environment variable (<code>ENABLE_DELETE=false</code>).
              </p>
            </div>
          </div>
        )}

        {/* Database Config */}
        <div className="max-w-2xl">
          <DbConnectionForm
            title="Target Database to Clean"
            badge="TARGET DB"
            badgeColor="orange"
            value={dbState}
            onChange={setDbState}
          />
        </div>

        <div className="flex justify-start">
          <button
            onClick={fetchEntities}
            disabled={fetching}
            className="px-7 py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 hover:opacity-95 text-white text-xs font-black rounded-2xl transition flex items-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 tracking-wide cursor-pointer disabled:cursor-not-allowed"
          >
            <span>{fetching ? "⏳" : "🔍"}</span>
            <span>{fetching ? "Connecting..." : "Inspect Tables / Collections"}</span>
          </button>
        </div>

        {/* Actions Selection */}
        <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Select Operation Type
          </h3>

          <div className="grid sm:grid-cols-3 gap-4">
            <label
              className={`p-4 rounded-2xl border cursor-pointer transition ${
                actionType === "drop_entities"
                  ? "bg-gradient-to-r from-orange-500/15 to-red-500/15 border-orange-500/70 text-white ring-1 ring-orange-500/30"
                  : "bg-[#090d16]/80 border-slate-800 text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              <input
                type="radio"
                name="actionType"
                checked={actionType === "drop_entities"}
                onChange={() => setActionType("drop_entities")}
                className="sr-only"
              />
              <span className="font-bold text-sm text-orange-400 block mb-1">
                Drop Tables / Collections
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Permanently deletes the selected tables or collections and their schemas.
              </p>
            </label>

            <label
              className={`p-4 rounded-2xl border cursor-pointer transition ${
                actionType === "truncate_entities"
                  ? "bg-gradient-to-r from-amber-500/15 to-sky-500/15 border-sky-400/70 text-white ring-1 ring-sky-400/30"
                  : "bg-[#090d16]/80 border-slate-800 text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              <input
                type="radio"
                name="actionType"
                checked={actionType === "truncate_entities"}
                onChange={() => setActionType("truncate_entities")}
                className="sr-only"
              />
              <span className="font-bold text-sm text-sky-400 block mb-1">
                Truncate / Clear Records
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Empties all records while preserving table schemas and indexes.
              </p>
            </label>

            <label
              className={`p-4 rounded-2xl border cursor-pointer transition ${
                actionType === "drop_database"
                  ? "bg-red-950/40 border-red-500 text-white ring-1 ring-red-500/40"
                  : "bg-[#090d16]/80 border-slate-800 text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              <input
                type="radio"
                name="actionType"
                checked={actionType === "drop_database"}
                onChange={() => setActionType("drop_database")}
                className="sr-only"
              />
              <span className="font-bold text-sm text-red-400 block mb-1">
                Drop Entire Database
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                ⚠️ Destroys the entire database. Requires explicit confirmation.
              </p>
            </label>
          </div>

          {/* Table / Collection List */}
          {actionType !== "drop_database" && entities.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Select Items ({selectedCount}/{entities.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3.5 py-1.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3.5 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                {entities.map((entity) => (
                  <label
                    key={entity.name}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition ${
                      entity.selected
                        ? "bg-gradient-to-r from-orange-500/15 to-red-500/15 border-orange-500/70 text-white"
                        : "bg-[#090d16]/80 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <input
                        type="checkbox"
                        checked={entity.selected}
                        onChange={() => toggleEntity(entity.name)}
                        className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold truncate">{entity.name}</span>
                    </div>
                    {entity.count !== undefined && (
                      <span className="text-[10px] font-mono bg-slate-900 px-2 py-0.5 rounded text-sky-300 border border-slate-800">
                        ~{entity.count}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={handleExecute}
            disabled={loading || !deleteEnabled || (actionType !== "drop_database" && selectedCount === 0)}
            className={`w-full py-4 rounded-2xl font-black text-sm transition flex items-center justify-center gap-2 shadow-2xl cursor-pointer disabled:cursor-not-allowed ${
              loading || !deleteEnabled || (actionType !== "drop_database" && selectedCount === 0)
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-gradient-to-r from-orange-600 via-amber-600 to-sky-600 text-white hover:opacity-95 active:scale-[0.99] shadow-orange-600/25 ring-1 ring-white/10"
            }`}
          >
            <span>{loading ? "⏳" : !deleteEnabled ? "🔒" : "⚠️"}</span>
            <span>
              {loading
                ? "Executing..."
                : !deleteEnabled
                ? "Delete Feature Disabled (ENABLE_DELETE=false)"
                : actionType === "drop_database"
                ? "Confirm Drop Entire Database"
                : `Execute ${actionType === "truncate_entities" ? "Truncate" : "Drop"} on ${selectedCount} Item(s)`}
            </span>
          </button>
        </div>

        {/* Operation Log */}
        {operationLog && (
          <div className="bg-[#090d16] rounded-2xl border border-slate-800 p-5 space-y-2.5">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span className="font-bold text-slate-200">Operation Log</span>
              <button
                onClick={() => setOperationLog("")}
                className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-52 overflow-y-auto leading-relaxed">
              {operationLog}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
