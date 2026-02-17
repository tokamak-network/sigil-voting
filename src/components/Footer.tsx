import { useTranslation } from '../i18n'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="max-w-7xl mx-auto w-full px-6 py-8 border-t-2 border-black flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
        <div className="flex items-center gap-2 text-black">
          <span className="w-2 h-2 bg-emerald-500"></span>
          {t.footer.systemOperational}
        </div>
        <span className="hidden md:block w-1 h-1 bg-slate-300"></span>
        <span className="hidden md:block">{t.footer.protocolVersion}</span>
        <span className="hidden md:block w-1 h-1 bg-slate-300"></span>
        <span className="hidden md:block">{t.footer.node}</span>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.footer.copyright}</p>
    </footer>
  )
}
