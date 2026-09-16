// src/components/Footer.jsx
export default function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-[#090d16]/95 backdrop-blur-xl py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-bold bg-gradient-to-r from-orange-400 to-sky-400 bg-clip-text text-transparent text-sm">
            Data Manager
          </span>
          <span>•</span>
          <span className="text-slate-400">Universal Multi-Database Migration & Backup Engine</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span>Developed by</span>
          <a
            href="https://www.linkedin.com/in/krashang-kumar"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold bg-gradient-to-r from-orange-400 to-sky-400 hover:from-orange-300 hover:to-sky-300 bg-clip-text text-transparent transition flex items-center gap-1.5 underline underline-offset-4 decoration-orange-500/40 hover:decoration-sky-400"
          >
            <span>Krashang Kumar</span>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-sky-500 text-slate-950 text-[10px] font-black not-italic">
              in
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
