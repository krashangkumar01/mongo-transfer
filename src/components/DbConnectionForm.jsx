// src/components/DbConnectionForm.jsx
"use client";
import { useState } from "react";
import { SUPPORTED_DATABASES } from "@/lib/db/constants.js";

export default function DbConnectionForm({
  title = "Database Connection",
  badge = "Source",
  badgeColor = "orange",
  value,
  onChange,
}) {
  const [mode, setMode] = useState("uri"); // 'uri' | 'fields'
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const dbType = value.dbType || "mongodb";
  const config = value.config || {};
  const currentDbInfo = SUPPORTED_DATABASES.find((d) => d.id === dbType) || SUPPORTED_DATABASES[0];

  const updateDbType = (newType) => {
    const dbInfo = SUPPORTED_DATABASES.find((d) => d.id === newType);
    setTestResult(null);
    onChange({
      dbType: newType,
      config: {
        ...config,
        port: dbInfo?.defaultPort || 0,
      },
    });
  };

  const updateConfigField = (field, val) => {
    onChange({
      dbType,
      config: {
        ...config,
        [field]: val,
      },
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/db/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbType, config }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const loadExample = () => {
    if (dbType === "mongodb") {
      updateConfigField("uri", "mongodb://localhost:27017/test");
    } else if (dbType === "postgresql") {
      updateConfigField("uri", "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable");
    } else if (dbType === "mysql") {
      updateConfigField("uri", "mysql://root:root@localhost:3306/test");
    } else if (dbType === "mssql") {
      updateConfigField(
        "uri",
        "Server=localhost,1433;Database=master;User Id=sa;Password=Your_Password123;Encrypt=false;TrustServerCertificate=true;"
      );
    } else if (dbType === "dynamodb") {
      onChange({
        dbType: "dynamodb",
        config: {
          region: "us-east-1",
          endpoint: "http://localhost:8000",
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      });
    }
  };

  const badgeColorClasses = {
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    blue: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  }[badgeColor] || "bg-orange-500/10 text-orange-400 border-orange-500/30";

  return (
    <div className="bg-[#0f172a]/70 backdrop-blur-2xl rounded-3xl p-6 sm:p-7 border border-slate-800 shadow-2xl shadow-black/40 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badgeColorClasses}`}>
            {badge}
          </span>
          <h2 className="text-base font-bold text-white tracking-wide">{title}</h2>
        </div>
        <button
          type="button"
          onClick={loadExample}
          className="text-xs text-orange-400 hover:text-sky-300 underline underline-offset-4 transition font-medium cursor-pointer"
        >
          Use Local Preset
        </button>
      </div>

      {/* Database Selector Grid */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Select Database Engine
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {SUPPORTED_DATABASES.map((db) => {
            const isSelected = db.id === dbType;
            return (
              <button
                key={db.id}
                type="button"
                onClick={() => updateDbType(db.id)}
                className={`p-3 rounded-2xl text-left border transition-all flex items-center gap-3 cursor-pointer ${
                  isSelected
                    ? "bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-sky-500/20 border-sky-400/80 text-white shadow-lg shadow-sky-500/10 ring-1 ring-sky-400/40"
                    : "bg-[#090d16]/80 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700"
                }`}
              >
                <span className="text-xl">{db.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{db.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {db.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connection Mode Toggle (URI vs Individual Fields) */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Connection Parameters
        </span>
        <div className="flex bg-[#090d16] p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setMode("uri")}
            className={`px-3 py-1 rounded-lg transition font-medium cursor-pointer ${
              mode === "uri"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Connection String
          </button>
          <button
            type="button"
            onClick={() => setMode("fields")}
            className={`px-3 py-1 rounded-lg transition font-medium cursor-pointer ${
              mode === "fields"
                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Form Fields
          </button>
        </div>
      </div>

      {/* Form Inputs based on Mode */}
      {mode === "uri" ? (
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {dbType === "dynamodb" ? "DynamoDB Endpoint URL (Optional)" : "Connection String / URI"}
          </label>
          <textarea
            rows={dbType === "mssql" ? 3 : 2}
            value={config.uri || (dbType === "dynamodb" ? config.endpoint || "" : "")}
            onChange={(e) => {
              if (dbType === "dynamodb") {
                updateConfigField("endpoint", e.target.value);
              } else {
                updateConfigField("uri", e.target.value);
              }
            }}
            placeholder={currentDbInfo.uriPlaceholder}
            className="w-full px-3.5 py-2.5 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition font-mono text-xs"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {dbType === "dynamodb" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">AWS Region</label>
                  <input
                    type="text"
                    value={config.region || "us-east-1"}
                    onChange={(e) => updateConfigField("region", e.target.value)}
                    placeholder="us-east-1"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Endpoint (Optional)</label>
                  <input
                    type="text"
                    value={config.endpoint || ""}
                    onChange={(e) => updateConfigField("endpoint", e.target.value)}
                    placeholder="http://localhost:8000"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Access Key ID</label>
                  <input
                    type="password"
                    value={config.accessKeyId || ""}
                    onChange={(e) => updateConfigField("accessKeyId", e.target.value)}
                    placeholder="AKIA..."
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    value={config.secretAccessKey || ""}
                    onChange={(e) => updateConfigField("secretAccessKey", e.target.value)}
                    placeholder="******"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Host / Server</label>
                  <input
                    type="text"
                    value={config.host || ""}
                    onChange={(e) => updateConfigField("host", e.target.value)}
                    placeholder="localhost or cluster.xyz.com"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={config.port || currentDbInfo.defaultPort}
                    onChange={(e) => updateConfigField("port", e.target.value)}
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Database Name</label>
                  <input
                    type="text"
                    value={config.database || ""}
                    onChange={(e) => updateConfigField("database", e.target.value)}
                    placeholder="mydb"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={config.username || ""}
                    onChange={(e) => updateConfigField("username", e.target.value)}
                    placeholder="user"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={config.password || ""}
                    onChange={(e) => updateConfigField("password", e.target.value)}
                    placeholder="******"
                    className="w-full px-3 py-2 bg-[#090d16]/90 border border-slate-800 rounded-xl text-white text-xs focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.ssl)}
                    onChange={(e) => updateConfigField("ssl", e.target.checked)}
                    className="rounded accent-sky-500"
                  />
                  <span>Enable SSL / TLS</span>
                </label>
                {dbType === "mongodb" && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(config.srv)}
                      onChange={(e) => updateConfigField("srv", e.target.checked)}
                      className="rounded accent-sky-500"
                    />
                    <span>Use mongodb+srv</span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Test Connection Button & Status */}
      <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing}
          className="px-3.5 py-1.5 bg-[#090d16] hover:bg-slate-800 border border-slate-700 text-sky-400 hover:text-sky-300 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>{testing ? "⏳" : "🔌"}</span>
          <span>{testing ? "Testing..." : "Test Connection"}</span>
        </button>

        {testResult && (
          <div
            className={`text-xs px-3 py-1 rounded-xl border font-medium flex items-center gap-1.5 ${
              testResult.success
                ? "bg-sky-500/10 text-sky-300 border-sky-500/40"
                : "bg-red-500/10 text-red-300 border-red-500/40"
            }`}
          >
            <span>{testResult.success ? "✅ Connected" : "❌ Connection Failed"}</span>
            {testResult.latencyMs !== undefined && (
              <span className="text-[10px] opacity-75">({testResult.latencyMs}ms)</span>
            )}
            {testResult.version && (
              <span className="text-[10px] text-slate-300 truncate max-w-[150px]">
                {testResult.version}
              </span>
            )}
            {testResult.message && !testResult.success && (
              <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={testResult.message}>
                {testResult.message}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
