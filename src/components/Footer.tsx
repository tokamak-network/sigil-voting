import { useTranslation } from '../i18n'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="w-full px-12 py-16 border-t-2 border-black bg-white">
      <div className="flex flex-col md:flex-row justify-between items-start gap-12">
        {/* Brand */}
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <img src="/assets/symbol.svg" alt="SIGIL" className="w-8 h-8" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase">SIGIL</span>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-xs font-bold text-slate-400 uppercase tracking-widest">{t.footer.poweredBy}</p>
            <p className="font-bold text-lg tracking-widest">TOKAMAK NETWORK</p>
          </div>
        </div>

        {/* Link Columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-16">
          {/* Protocol */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Protocol_</h5>
            <ul className="font-mono text-sm space-y-4 font-bold uppercase">
              <li><a href="https://maci.pse.dev" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">{t.footer.whitepaper}</a></li>
              <li><a href="https://github.com/tokamak-network/zk-dex" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">{t.footer.audit}</a></li>
              <li><a href="https://maci.pse.dev/docs" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">{t.footer.sdk}</a></li>
            </ul>
          </div>

          {/* Network */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Network_</h5>
            <ul className="font-mono text-sm space-y-4 font-bold uppercase">
              <li><a href="https://x.com/tokaboratory" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">X / Twitter</a></li>
              <li><a href="https://github.com/tokamak-network" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">Github</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Legal_</h5>
            <ul className="font-mono text-sm space-y-4 font-bold uppercase">
              <li><span className="text-slate-400 cursor-default">{t.footer.terms}</span></li>
              <li><span className="text-slate-400 cursor-default">{t.footer.privacy}</span></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mt-20 pt-8 border-t-2 border-black flex flex-col md:flex-row justify-between items-center gap-6">
        <p className="font-mono text-xs font-bold uppercase tracking-widest">{t.footer.copyright}</p>
        <div className="flex items-center gap-8 font-mono text-xs font-bold uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>{t.footer.privacyFirst}</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>{t.footer.antiBribery}</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>{t.footer.verifiedTally}</span>
        </div>
      </div>
    </footer>
  )
}
