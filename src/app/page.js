// src/app/page.js
"use client";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import DbConnectionForm from "@/components/DbConnectionForm";

export default function Home() {
  const [sourceDb, setSourceDb] = useState({
    dbType: "mongodb",
    config: { uri: "" },
  });

  const [destDb, setDestDb] = useState({
    dbType: "postgresql",
    config: { uri: "" },
  });

  const [entities, setEntities] = useState([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [fetching, setFetching] = useState(false);

  // Transfer options
  const [writeMode, setWriteMode] = useState("append"); // 'append' | 'truncate' | 'overwrite'
  const [batchSize, setBatchSize] = useState(500);
  const [backupBeforeTransfer, setBackupBeforeTransfer] = useState(true);
  const [backupTarget, setBackupTarget] = useState("destination"); // 'destination' | 'source'

  // Transfer state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statuses, setStatuses] = useState({});
  const [backupInfo, setBackupInfo] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const [transferEnabled, setTransferEnabled] = useState(
    process.env.NEXT_PUBLIC_ENABLE_TRANSFER !== "false"
  );

  useEffect(() => {
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.features) {
          setTransferEnabled(data.features.transfer);
        }
      })
      .catch(() => {});
  }, []);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogMessages((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const fetchEntities = async () => {
    setFetching(true);
    setBackupInfo(null);
    setStatuses({});
    addLog(`Connecting to source ${sourceDb.dbType} to fetch entities...`);

    try {
      const res = await fetch("/api/db/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbType: sourceDb.dbType,
          config: sourceDb.config,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setEntities(
          data.entities.map((e) => ({
            name: e.name,
            type: e.type,
            count: e.count || 0,
            selected: true,
          }))
        );
        addLog(`Found ${data.entities.length} tables/collections.`);
      } else {
        alert("Error fetching entities: " + (data.message || "Unknown error"));
        addLog(`Error fetching entities: ${data.message}`);
      }
    } catch (err) {
      alert("Failed to connect: " + err.message);
      addLog(`Fetch failed: ${err.message}`);
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

  const filteredEntities = entities.filter((e) =>
    e.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const selectedCount = entities.filter((e) => e.selected).length;

  const handleTransfer = async () => {
    const selectedEntities = entities.filter((e) => e.selected).map((e) => e.name);
    if (selectedEntities.length === 0) {
      return alert("Please select at least one table or collection to transfer!");
    }

    setLoading(true);
    setProgress(5);
    setStatuses({});
    setBackupInfo(null);
    setLogMessages([]);
    addLog(`Initiating transfer from ${sourceDb.dbType} to ${destDb.dbType}...`);

    if (backupBeforeTransfer) {
      addLog(`Safety snapshot enabled. Backing up ${backupTarget} database first...`);
    }

    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: sourceDb,
          destination: destDb,
          entities: selectedEntities,
          options: {
            mode: writeMode,
            batchSize: Number(batchSize),
            backupBeforeTransfer,
            backupTarget,
          },
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.backup?.success) {
          setBackupInfo(data.backup);
          addLog(`Pre-transfer backup created: ID ${data.backup.backupId}`);
        } else if (data.backup?.warning) {
          addLog(`Warning: ${data.backup.warning}`);
        }

        const total = data.results.length;
        data.results.forEach((item, i) => {
          setTimeout(() => {
            setStatuses((prev) => ({
              ...prev,
              [item.name]: {
                status: item.status,
                message: item.message || "",
                count: item.count || item.readCount || 0,
                insertedCount: item.insertedCount || 0,
              },
            }));
            setProgress(Math.round(((i + 1) / total) * 100));
            addLog(`Completed ${item.name}: ${item.status} (${item.insertedCount || 0} records transferred)`);
          }, i * 350);
        });

        setTimeout(() => {
          setLoading(false);
          setProgress(100);
          addLog("Transfer execution finished successfully!");
        }, total * 360 + 200);
      } else {
        alert("Transfer failed: " + (data.message || "Unknown error"));
        addLog(`Transfer error: ${data.message}`);
        setLoading(false);
      }
    } catch (err) {
      alert("Transfer exception: " + err.message);
      addLog(`Transfer exception: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Intro Hero Banner with Orange & Sky Blue accents */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-950/25 via-[#0f172a]/70 to-sky-950/25 border border-slate-800 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-black/50">
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gradient-to-r from-orange-500/15 to-sky-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold mb-3 shadow-sm">
              <span>⚡</span>
              <span>Universal Database Migration & Snapshot Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Transfer Data Between Any Database With Zero Friction
            </h1>
            <p className="text-sm text-slate-300 mt-2.5 leading-relaxed">
              Seamlessly migrate, convert schemas, and replicate tables across
              <strong className="text-sky-400"> PostgreSQL</strong>,
              <strong className="text-orange-400"> MySQL</strong>,
              <strong className="text-sky-300"> SQL Server</strong>,
              <strong className="text-amber-400"> DynamoDB</strong>, and
              <strong className="text-orange-300"> MongoDB</strong> with automated pre-transfer snapshot backups.
            </p>
          </div>
        </div>

        {/* Feature Disabled Banner */}
        {!transferEnabled && (
          <div className="bg-orange-950/30 border border-orange-500/40 rounded-2xl p-5 flex items-center gap-4 text-orange-200">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-orange-300">Database Transfer Feature is Disabled</h3>
              <p className="text-xs text-orange-400/80 mt-0.5">
                Transfer and migration operations are currently disabled by the administrator via environment variable (<code>ENABLE_TRANSFER=false</code>).
              </p>
            </div>
          </div>
        )}

        {/* Database Configuration Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          <DbConnectionForm
            title="Source Database"
            badge="SOURCE (FROM)"
            badgeColor="orange"
            value={sourceDb}
            onChange={setSourceDb}
          />
          <DbConnectionForm
            title="Destination Database"
            badge="DESTINATION (TO)"
            badgeColor="sky"
            value={destDb}
            onChange={setDestDb}
          />
        </div>

        {/* Action Bar: Fetch Tables */}
        <div className="flex justify-center">
          <button
            onClick={fetchEntities}
            disabled={fetching}
            className={`px-8 py-3.5 rounded-2xl font-black transition-all shadow-xl flex items-center gap-3 text-sm tracking-wide cursor-pointer disabled:cursor-not-allowed ${
              fetching
                ? "bg-slate-800 text-slate-500 border border-slate-700"
                : "bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 text-white hover:opacity-95 active:scale-95 shadow-orange-500/25 ring-1 ring-white/10"
            }`}
          >
            <span>{fetching ? "⏳" : "🔍"}</span>
            <span>{fetching ? "Inspecting Source Database..." : "Fetch Tables / Collections"}</span>
          </button>
        </div>

        {/* Entities Selection & Transfer Settings */}
        {entities.length > 0 && (
          <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl shadow-black/50 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <span className="w-1.5 h-6 bg-gradient-to-b from-orange-500 to-sky-500 rounded-full"></span>
                  Select Tables & Collections ({selectedCount}/{entities.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose which tables or collections to transfer to the destination database.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filter tables..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="px-3.5 py-1.5 bg-[#090d16] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 w-44"
                />
                <button
                  onClick={selectAll}
                  className="px-3.5 py-1.5 rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30 text-xs font-bold transition cursor-pointer"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Entity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
              {filteredEntities.map((entity) => (
                <label
                  key={entity.name}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition select-none ${
                    entity.selected
                      ? "bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-sky-500/15 border-sky-400/70 shadow-sm ring-1 ring-sky-400/30"
                      : "bg-[#090d16]/80 border-slate-800 hover:bg-slate-800/40 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={entity.selected}
                      onChange={() => toggleEntity(entity.name)}
                      className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white truncate block">
                        {entity.name}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {entity.type}
                      </span>
                    </div>
                  </div>
                  {entity.count !== undefined && (
                    <span className="text-xs bg-slate-900 px-2 py-0.5 rounded-md text-sky-300 border border-slate-800 font-mono">
                      ~{entity.count.toLocaleString()}
                    </span>
                  )}
                </label>
              ))}
            </div>

            {/* Transfer Options Panel */}
            <div className="bg-[#090d16]/80 rounded-2xl p-5 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Migration & Backup Safeguards
              </h4>

              <div className="grid md:grid-cols-3 gap-5">
                {/* Pre-transfer backup */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupBeforeTransfer}
                      onChange={(e) => setBackupBeforeTransfer(e.target.checked)}
                      className="rounded accent-orange-500"
                    />
                    <span className="text-xs font-bold text-orange-400">
                      🛡️ Pre-Transfer Snapshot Backup
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Creates an automated Gzip/NDJSON snapshot backup on the server before writing data.
                  </p>
                  {backupBeforeTransfer && (
                    <select
                      value={backupTarget}
                      onChange={(e) => setBackupTarget(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-slate-200"
                    >
                      <option value="destination">Backup Destination DB (Safe)</option>
                      <option value="source">Backup Source DB</option>
                      <option value="both">Backup Both</option>
                    </select>
                  )}
                </div>

                {/* Write Mode */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">
                    ⚙️ Destination Write Mode
                  </label>
                  <select
                    value={writeMode}
                    onChange={(e) => setWriteMode(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-slate-200"
                  >
                    <option value="append">Append (Insert new records, ignore existing)</option>
                    <option value="truncate">Truncate / Empty (Preserve schema, clean records)</option>
                    <option value="overwrite">Overwrite / Recreate (Drop table and recreate)</option>
                  </select>
                  <p className="text-[11px] text-slate-400">
                    Determines how existing destination tables or collections will be handled.
                  </p>
                </div>

                {/* Batch Size */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">
                    📦 Batch Chunk Size
                  </label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-slate-200"
                  >
                    <option value={100}>100 records / batch (Low memory)</option>
                    <option value={500}>500 records / batch (Balanced - Recommended)</option>
                    <option value={1000}>1,000 records / batch (Fast)</option>
                    <option value={2500}>2,500 records / batch (High throughput)</option>
                  </select>
                  <p className="text-[11px] text-slate-400">
                    Controls streaming memory footprint and bulk insert query size.
                  </p>
                </div>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleTransfer}
              disabled={loading || selectedCount === 0 || !transferEnabled}
              className={`w-full py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-3 text-base shadow-2xl cursor-pointer disabled:cursor-not-allowed ${
                loading || selectedCount === 0 || !transferEnabled
                  ? "bg-slate-800 text-slate-500 border border-slate-700"
                  : "bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 text-white hover:opacity-95 active:scale-[0.99] shadow-orange-500/25 ring-1 ring-white/15"
              }`}
            >
              <span>{loading ? "⏳" : !transferEnabled ? "🔒" : "⚡"}</span>
              <span>
                {loading
                  ? "Transferring Data..."
                  : !transferEnabled
                  ? "Transfer Feature Disabled (ENABLE_TRANSFER=false)"
                  : `Execute Migration (${selectedCount} Entities)`}
              </span>
            </button>
          </div>
        )}

        {/* Progress & Live Status */}
        {loading && (
          <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-300">Transfer Progress</span>
              <span className="text-xl font-black bg-gradient-to-r from-orange-400 to-sky-400 bg-clip-text text-transparent">
                {progress}%
              </span>
            </div>
            <div className="h-3 bg-[#090d16] rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-sky-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Backup Notification Banner */}
        {backupInfo && (
          <div className="bg-orange-950/30 border border-orange-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div>
                <h4 className="text-sm font-bold text-orange-300">Pre-Transfer Backup Completed</h4>
                <p className="text-xs text-orange-400/80">
                  Snapshot ID: <span className="font-mono">{backupInfo.backupId}</span> (
                  {backupInfo.manifest?.totalRecords || 0} records archived)
                </p>
              </div>
            </div>
            <a
              href={`/api/backup/${backupInfo.backupId}`}
              download
              className="px-4 py-2 bg-gradient-to-r from-orange-500 to-sky-500 hover:opacity-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-orange-500/20 cursor-pointer"
            >
              <span>📥</span>
              <span>Download Archive</span>
            </a>
          </div>
        )}

        {/* Per-Entity Results Card */}
        {Object.keys(statuses).length > 0 && (
          <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-7 border border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2.5">
              <span className="w-1.5 h-6 bg-gradient-to-b from-orange-500 to-sky-500 rounded-full"></span>
              Execution Summary
            </h3>

            <div className="space-y-2.5">
              {entities
                .filter((e) => e.selected)
                .map((entity) => {
                  const s = statuses[entity.name];
                  const statusKey = s ? s.status : "pending";

                  return (
                    <div
                      key={entity.name}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border transition gap-3 ${
                        statusKey === "done"
                          ? "bg-sky-500/10 border-sky-500/40"
                          : statusKey === "error"
                          ? "bg-red-500/10 border-red-500/40"
                          : statusKey === "empty"
                          ? "bg-amber-500/10 border-amber-500/40"
                          : "bg-[#090d16]/80 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-white">{entity.name}</span>
                        {s && s.count > 0 && (
                          <span className="text-xs bg-slate-900 px-2 py-0.5 rounded-md text-sky-300 font-mono border border-slate-800">
                            {s.insertedCount || s.count} records
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-medium">
                        {statusKey === "done" && (
                          <span className="text-sky-400 font-bold flex items-center gap-1">
                            ✅ Completed
                          </span>
                        )}
                        {statusKey === "empty" && (
                          <span className="text-amber-400 font-bold flex items-center gap-1">
                            ⚠️ Empty (0 records)
                          </span>
                        )}
                        {statusKey === "processing" && (
                          <span className="text-orange-400 font-bold flex items-center gap-1">
                            ⏳ Transferring...
                          </span>
                        )}
                        {statusKey === "error" && (
                          <div className="text-red-400">
                            <span className="font-bold flex items-center gap-1">❌ Failed</span>
                            {s.message && (
                              <p className="text-[11px] text-red-300 mt-0.5">{s.message}</p>
                            )}
                          </div>
                        )}
                        {statusKey === "pending" && (
                          <span className="text-slate-500">Queued</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Live Execution Console */}
        {logMessages.length > 0 && (
          <div className="bg-[#090d16] rounded-2xl border border-slate-800 p-5 font-mono text-xs text-slate-300 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
              <span className="flex items-center gap-2 font-bold text-slate-200">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
                Console Log
              </span>
              <button
                onClick={() => setLogMessages([])}
                className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {logMessages.map((msg, i) => (
                <div key={i} className="leading-relaxed">
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
