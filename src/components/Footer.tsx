import { useTranslation } from '../i18n'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t-2 border-black">
      {/* Resource Links */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex flex-col md:flex-row justify-between items-start gap-8">
        {/* Brand */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <img src="/assets/symbol.svg" alt="SIGIL" className="w-6 h-6" />
            <span className="font-display font-bold text-lg tracking-tighter uppercase italic">SIGIL</span>
          </div>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">{t.footer.desc}</p>
        </div>

        {/* Resources */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.footer.resources}</span>
          <a
            href="https://maci.pse.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-600 hover:text-black transition-colors"
          >
            {t.footer.whitepaper}
          </a>
          <a
            href="https://github.com/tokamak-network/zk-dex"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-600 hover:text-black transition-colors"
          >
            {t.footer.audit}
          </a>
        </div>
      </div>

      {/* Status Bar */}
      <div className="border-t border-slate-200">
        <div className="max-w-7xl mx-auto w-full px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            <div className="flex items-center gap-2 text-black">
              <span className="w-2 h-2 bg-emerald-500"></span>
              {t.footer.systemOperational}
            </div>
            <span className="hidden md:block w-1 h-1 bg-slate-300"></span>
            <span className="hidden md:block">{t.footer.protocolVersion}</span>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  )
}
