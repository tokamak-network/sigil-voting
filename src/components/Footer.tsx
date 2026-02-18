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
            <p className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol Powered By</p>
            <p className="font-bold text-lg tracking-widest">TOKAMAK NETWORK</p>
          </div>
        </div>

        {/* Link Columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-16">
          {/* Protocol */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Protocol_</h5>
            <ul className="font-mono text-xs space-y-4 font-bold uppercase">
              <li><a href="https://maci.pse.dev" target="_blank" rel="noopener noreferrer" className="hover:underline">MACI Docs</a></li>
              <li><a href="https://maci.pse.dev" target="_blank" rel="noopener noreferrer" className="hover:underline">{t.footer.whitepaper}</a></li>
              <li><a href="https://github.com/tokamak-network/zk-dex" target="_blank" rel="noopener noreferrer" className="hover:underline">{t.footer.audit}</a></li>
            </ul>
          </div>

          {/* Network */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Network_</h5>
            <ul className="font-mono text-xs space-y-4 font-bold uppercase">
              <li><a href="https://discord.gg/tokamak" target="_blank" rel="noopener noreferrer" className="hover:underline">Discord</a></li>
              <li><a href="https://x.com/tokaboratory" target="_blank" rel="noopener noreferrer" className="hover:underline">X / Twitter</a></li>
              <li><a href="https://github.com/tokamak-network" target="_blank" rel="noopener noreferrer" className="hover:underline">Github</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-6">
            <h5 className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Legal_</h5>
            <ul className="font-mono text-xs space-y-4 font-bold uppercase">
              <li><a href="#" className="hover:underline">Terms</a></li>
              <li><a href="#" className="hover:underline">Privacy</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mt-20 pt-8 border-t-2 border-black flex flex-col md:flex-row justify-between items-center gap-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest">{t.footer.copyright}</p>
        <div className="flex items-center gap-8 font-mono text-[10px] font-bold uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>Privacy_First</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>Anti_Bribery</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-green-500"></span>Verified_Tally</span>
        </div>
      </div>
    </footer>
  )
}
