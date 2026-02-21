import { en } from '../../i18n/en'

export function FooterStatic() {
  const t = en
  return (
    <footer className="py-16 bg-slate-100 dark:bg-zinc-950 border-t-2 border-border-light dark:border-border-dark">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2 mb-6">
              <img src="/assets/symbol.svg" alt="SIGIL" className="w-8 h-8" />
              <span className="font-display font-extrabold text-xl tracking-tighter uppercase">SIGIL</span>
            </div>
            <p className="text-base text-slate-500 max-w-sm mb-8">{t.footer.desc}</p>
            <div className="flex gap-4">
              <a href="https://x.com/tokaboratory" target="_blank" rel="noopener noreferrer" className="w-10 h-10 border-2 border-border-light dark:border-border-dark flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                <span className="font-display font-bold">X</span>
              </a>
              <a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer" className="w-10 h-10 border-2 border-border-light dark:border-border-dark flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                <span className="font-display font-bold">GH</span>
              </a>
              <a href="https://t.me/tokamak_network" target="_blank" rel="noopener noreferrer" className="w-10 h-10 border-2 border-border-light dark:border-border-dark flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                <span className="font-display font-bold">TG</span>
              </a>
            </div>
          </div>
          <div className="md:col-span-4">
            <h5 className="font-display font-bold mb-6 uppercase text-base">{t.footer.resources}</h5>
            <ul className="space-y-4 text-base text-slate-500">
              <li><a href="https://maci.pse.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">{t.footer.whitepaper}</a></li>
              <li><a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">{t.footer.audit}</a></li>
            </ul>
          </div>
          <div className="md:col-span-3">
            <h5 className="font-display font-bold mb-6 uppercase text-base">{t.footer.poweredBy}</h5>
            <a href="https://tokamak.network" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group cursor-pointer">
              <img src="/assets/tokamak-symbol.svg" alt="Tokamak Network" className="w-10 h-10" />
              <div>
                <div className="font-display font-bold text-sm uppercase group-hover:text-primary transition-colors">Tokamak Network</div>
                <div className="text-xs opacity-60 font-display uppercase">{t.footer.coreInfra}</div>
              </div>
            </a>
          </div>
        </div>
        <div className="border-t-2 border-border-light dark:border-border-dark pt-8">
          <div className="font-display text-sm opacity-50">{t.footer.copyright}</div>
        </div>
      </div>
    </footer>
  )
}
