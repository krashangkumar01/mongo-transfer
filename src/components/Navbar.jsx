// src/components/Navbar.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const [features, setFeatures] = useState({
    transfer: process.env.NEXT_PUBLIC_ENABLE_TRANSFER !== "false",
    backup: process.env.NEXT_PUBLIC_ENABLE_BACKUP !== "false",
    delete: process.env.NEXT_PUBLIC_ENABLE_DELETE !== "false",
  });

  useEffect(() => {
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.features) {
          setFeatures(data.features);
        }
      })
      .catch(() => {});
  }, []);

  const navItems = [
    { href: "/", label: "Transfer Engine", icon: "🔄", enabled: features.transfer },
    { href: "/backup", label: "Backup & Restore", icon: "💾", enabled: features.backup },
    { href: "/delete", label: "Database Cleaner", icon: "🗑️", enabled: features.delete },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Brand with Orange & Sky Blue Gradient */}
        <Link href="/" className="flex items-center gap-3 group cursor-pointer">
          <div className="p-2.5 bg-gradient-to-tr from-orange-500 via-amber-500 to-sky-400 rounded-xl shadow-lg shadow-orange-500/25 group-hover:scale-105 transition-transform duration-200">
            <span className="text-xl">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-xl bg-gradient-to-r from-orange-400 via-amber-200 to-sky-400 bg-clip-text text-transparent tracking-tight">
                Data Manager
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
                Universal DB
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">PostgreSQL • MySQL • MSSQL • DynamoDB • MongoDB</p>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1.5 bg-[#0f172a]/90 p-1.5 rounded-xl border border-slate-800 shadow-inner">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? "bg-gradient-to-r from-orange-500 via-amber-500 to-sky-500 text-white shadow-lg shadow-orange-500/20"
                      : item.enabled
                      ? "text-slate-300 hover:text-sky-300 hover:bg-slate-800/70"
                      : "text-slate-500 hover:text-slate-400 opacity-60"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  {!item.enabled && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-bold">
                      OFF
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Developer Attribution Link */}
          <a
            href="https://www.linkedin.com/in/krashang-kumar"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-sky-500/10 hover:from-orange-500/20 hover:to-sky-500/20 border border-orange-500/30 hover:border-sky-400/60 text-xs font-semibold transition-all shadow-sm group cursor-pointer"
            title="Developed by Krashang Kumar on LinkedIn"
          >
            <span className="text-slate-400 text-[11px]">Dev:</span>
            <span className="bg-gradient-to-r from-orange-400 to-sky-300 bg-clip-text text-transparent font-bold group-hover:from-orange-300 group-hover:to-sky-200">
              Krashang Kumar
            </span>
            <span className="text-[10px] bg-sky-500 text-slate-950 font-black px-1.5 py-0.5 rounded shadow-sm">
              in
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
