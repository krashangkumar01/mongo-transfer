// src/app/backup/page.jsx
"use client";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import DbConnectionForm from "@/components/DbConnectionForm";

export default function BackupPage() {
  const [activeTab, setActiveTab] = useState("create"); // 'create' | 'library'

  // Backup creation state
  const [dbState, setDbState] = useState({
    dbType: "mongodb",
    config: { uri: "" },
  });
  const [entities, setEntities] = useState([]);
  const [fetchingEntities, setFetchingEntities] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [useGzip, setUseGzip] = useState(true);
  const [createdBackup, setCreatedBackup] = useState(null);

  // Stored backups library state
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // Restore state
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [restoreDbState, setRestoreDbState] = useState({
    dbType: "postgresql",
    config: { uri: "" },
  });
  const [restoreMode, setRestoreMode] = useState("append"); // 'append' | 'truncate'
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [backupEnabled, setBackupEnabled] = useState(
    process.env.NEXT_PUBLIC_ENABLE_BACKUP !== "false"
  );

  useEffect(() => {
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.features) {
          setBackupEnabled(data.features.backup);
        }
      })
      .catch(() => {});
  }, []);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (data.success) {
        setBackups(data.backups || []);
      }
    } catch (err) {
      console.error("Failed to load backups:", err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const fetchEntities = async () => {
    setFetchingEntities(true);
    setCreatedBackup(null);
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
            selected: true,
          }))
        );
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Failed to connect: " + err.message);
    } finally {
      setFetchingEntities(false);
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

  const handleCreateBackup = async () => {
    const selected = entities.filter((e) => e.selected).map((e) => e.name);
    if (selected.length === 0) {
      return alert("Please select at least one table or collection to backup!");
    }

    setCreatingBackup(true);
    setCreatedBackup(null);

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbType: dbState.dbType,
          config: dbState.config,
          entities: selected,
          options: {
            compressed: useGzip,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreatedBackup(data);
        loadBackups();
      } else {
        alert("Backup failed: " + data.message);
      }
    } catch (err) {
      alert("Backup error: " + err.message);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    if (!confirm(`Are you sure you want to permanently delete backup "${backupId}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/backup/${backupId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        if (selectedBackupForRestore?.id === backupId) {
          setSelectedBackupForRestore(null);
        }
        loadBackups();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackupForRestore) return;
    if (!confirm(`Restore backup "${selectedBackupForRestore.id}" to ${restoreDbState.dbType}?`)) {
      return;
    }

    setRestoring(true);
    setRestoreResult(null);

    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupId: selectedBackupForRestore.id,
          targetDbType: restoreDbState.dbType,
          targetConfig: restoreDbState.config,
          options: {
            mode: restoreMode,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRestoreResult(data);
      } else {
        alert("Restore failed: " + data.message);
      }
    } catch (err) {
      alert("Restore exception: " + err.message);
    } finally {
      setRestoring(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">💾</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Database Backup & Restore Hub
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Export and restore snapshot dumps for PostgreSQL, MySQL, SQL Server, DynamoDB, and MongoDB.
            </p>
          </div>

          <div className="flex bg-[#0f172a] p-1.5 rounded-2xl border border-slate-800 text-xs shadow-inner">
            <button
              onClick={() => setActiveTab("create")}
              className={`px-4 py-2 rounded-xl font-bold transition cursor-pointer ${
                activeTab === "create"
                  ? "bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 text-white shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ➕ Create Backup
            </button>
            <button
              onClick={() => {
                setActiveTab("library");
                loadBackups();
              }}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === "library"
                  ? "bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 text-white shadow-md shadow-orange-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📂 Backup Library</span>
              <span className="bg-slate-800 text-sky-400 font-bold px-2 py-0.5 rounded-full text-[10px] border border-slate-700">
                {backups.length}
              </span>
            </button>
          </div>
        </div>

        {/* Feature Disabled Banner */}
        {!backupEnabled && (
          <div className="bg-orange-950/30 border border-orange-500/40 rounded-2xl p-5 flex items-center gap-4 text-orange-200">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-orange-300">Backup & Restore Feature is Disabled</h3>
              <p className="text-xs text-orange-400/80 mt-0.5">
                Backup export and restoration operations have been disabled by the administrator via environment variable (<code>ENABLE_BACKUP=false</code>).
              </p>
            </div>
          </div>
        )}

        {/* Tab 1: Create Backup */}
        {activeTab === "create" && (
          <div className="space-y-6">
            <div className="max-w-2xl">
              <DbConnectionForm
                title="Select Target Database to Backup"
                badge="TARGET DB"
                badgeColor="orange"
                value={dbState}
                onChange={setDbState}
              />
            </div>

            <div className="flex justify-start">
              <button
                onClick={fetchEntities}
                disabled={fetchingEntities}
                className="px-7 py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 hover:opacity-95 text-white text-xs font-black rounded-2xl transition flex items-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 tracking-wide cursor-pointer disabled:cursor-not-allowed"
              >
                <span>{fetchingEntities ? "⏳" : "🔍"}</span>
                <span>{fetchingEntities ? "Discovering Tables..." : "Inspect Tables / Collections"}</span>
              </button>
            </div>

            {entities.length > 0 && (
              <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white">
                    Select Entities to Backup ({entities.filter((e) => e.selected).length}/{entities.length})
                  </h3>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                  {entities.map((entity) => (
                    <label
                      key={entity.name}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition ${
                        entity.selected
                          ? "bg-gradient-to-r from-orange-500/15 to-sky-500/15 border-sky-400/70 text-white ring-1 ring-sky-400/30"
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
                        <span className="text-[11px] font-mono bg-slate-900 px-2 py-0.5 rounded-md text-sky-300 border border-slate-800">
                          ~{entity.count}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="bg-[#090d16]/80 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useGzip}
                      onChange={(e) => setUseGzip(e.target.checked)}
                      className="rounded accent-sky-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white">Enable Gzip Compression (.json.gz)</span>
                      <p className="text-[11px] text-slate-400">Compresses data streams up to 90% for high efficiency storage.</p>
                    </div>
                  </label>
                </div>

                <button
                  onClick={handleCreateBackup}
                  disabled={creatingBackup || !backupEnabled}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 hover:opacity-95 text-white font-black text-base rounded-2xl transition flex items-center justify-center gap-2 shadow-2xl shadow-orange-500/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{creatingBackup ? "⏳" : !backupEnabled ? "🔒" : "💾"}</span>
                  <span>
                    {creatingBackup
                      ? "Generating Backup Archive..."
                      : !backupEnabled
                      ? "Backup Feature Disabled (ENABLE_BACKUP=false)"
                      : "Take Backup Now"}
                  </span>
                </button>
              </div>
            )}

            {createdBackup && (
              <div className="bg-orange-950/30 border border-orange-500/40 rounded-3xl p-6 sm:p-7 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <h4 className="text-base font-bold text-orange-300">Backup Created Successfully!</h4>
                    <p className="text-xs text-orange-400/80">
                      ID: <span className="font-mono">{createdBackup.backupId}</span>
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 text-xs font-mono bg-[#090d16]/90 p-4 rounded-2xl border border-orange-500/20">
                  <div>
                    <span className="text-slate-400 block">Total Records:</span>
                    <span className="text-white font-bold text-sm">
                      {createdBackup.manifest?.totalRecords?.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Compressed Size:</span>
                    <span className="text-sky-400 font-bold text-sm">
                      {formatBytes(createdBackup.manifest?.totalSizeBytes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Entities Archived:</span>
                    <span className="text-orange-400 font-bold text-sm">
                      {createdBackup.manifest?.entities?.length}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <a
                    href={`/api/backup/${createdBackup.backupId}`}
                    download
                    className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-sky-500 hover:opacity-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-orange-500/20 cursor-pointer"
                  >
                    <span>📥</span>
                    <span>Download Archive (.tar.gz)</span>
                  </a>
                  <button
                    onClick={() => {
                      setSelectedBackupForRestore(createdBackup.manifest);
                      setActiveTab("library");
                    }}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition border border-slate-700 cursor-pointer"
                  >
                    Test Restore
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Stored Backups Library & Restore */}
        {activeTab === "library" && (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  Stored Backups ({backups.length})
                </h3>
                <button
                  onClick={loadBackups}
                  disabled={loadingBackups}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>🔄</span>
                  <span>Refresh</span>
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="text-center py-12 bg-[#0f172a]/70 rounded-3xl border border-slate-800">
                  <span className="text-4xl block mb-2">📦</span>
                  <p className="text-sm text-slate-400">No backups found on this server.</p>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="mt-4 px-4 py-2 bg-gradient-to-r from-orange-500 to-sky-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Create Your First Backup
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {backups.map((b) => (
                    <div
                      key={b.id}
                      className={`p-5 rounded-3xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        selectedBackupForRestore?.id === b.id
                          ? "bg-gradient-to-r from-orange-500/10 via-[#0f172a] to-sky-500/15 border-sky-400 shadow-xl shadow-sky-500/10"
                          : "bg-[#0f172a]/70 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono text-sm font-bold text-white truncate">
                            {b.id}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
                            {b.dbType}
                          </span>
                          {b.compressed && (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold">
                              Gzip
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          Created on {new Date(b.createdAt).toLocaleString()} •{" "}
                          <strong className="text-slate-200">{b.entities?.length || 0}</strong> entities •{" "}
                          <strong className="text-orange-400">
                            {(b.totalRecords || 0).toLocaleString()}
                          </strong>{" "}
                          records • {formatBytes(b.totalSizeBytes)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/backup/${b.id}`}
                          download
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                        >
                          <span>📥</span>
                          <span>Download</span>
                        </a>
                        <button
                          onClick={() => setSelectedBackupForRestore(b)}
                          className="px-3.5 py-2 bg-gradient-to-r from-orange-500 to-sky-500 hover:opacity-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md shadow-orange-500/20 cursor-pointer"
                        >
                          <span>🔄</span>
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(b.id)}
                          className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium rounded-xl transition cursor-pointer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Restore Panel */}
            {selectedBackupForRestore && (
              <div className="bg-[#0f172a]/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-sky-500/60 shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                      Restore Subsystem
                    </span>
                    <h3 className="text-lg font-black text-white">
                      Restore Backup: {selectedBackupForRestore.id}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedBackupForRestore(null)}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="max-w-2xl">
                  <DbConnectionForm
                    title="Select Destination Database for Restore"
                    badge="RESTORE TARGET"
                    badgeColor="sky"
                    value={restoreDbState}
                    onChange={setRestoreDbState}
                  />
                </div>

                <div className="bg-[#090d16]/90 p-4 rounded-2xl border border-slate-800 max-w-md space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Restore Mode
                  </label>
                  <select
                    value={restoreMode}
                    onChange={(e) => setRestoreMode(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-white cursor-pointer"
                  >
                    <option value="append">Append (Add to existing records)</option>
                    <option value="truncate">Truncate / Overwrite (Empty table first)</option>
                  </select>
                </div>

                <button
                  onClick={handleRestore}
                  disabled={restoring || !backupEnabled}
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 hover:opacity-95 text-white font-black text-sm rounded-2xl transition flex items-center gap-2 shadow-xl shadow-orange-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{restoring ? "⏳" : !backupEnabled ? "🔒" : "🚀"}</span>
                  <span>
                    {restoring
                      ? "Restoring Records to Target..."
                      : !backupEnabled
                      ? "Restore Disabled (ENABLE_BACKUP=false)"
                      : "Start Restoration Process"}
                  </span>
                </button>

                {restoreResult && (
                  <div className="bg-orange-950/30 border border-orange-500/40 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-bold text-orange-300 flex items-center gap-2">
                      <span>✅</span>
                      <span>Restoration Finished ({restoreResult.totalRestored} records restored)</span>
                    </h4>
                    <div className="space-y-1 text-xs">
                      {restoreResult.results?.map((r) => (
                        <div key={r.name} className="flex justify-between text-slate-300">
                          <span>{r.name}</span>
                          <span className="font-mono text-sky-400">
                            {r.restoredCount} records
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
