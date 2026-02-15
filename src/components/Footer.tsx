import { useTranslation } from '../i18n'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="brutalist-footer">
      <div className="brutalist-footer-grid">
        <div className="brutalist-footer-brand">
          <h2>SIGIL</h2>
          <p>{t.footer.desc}</p>
          <p className="brutalist-footer-attribution">Built by <a href="https://tokamak.network" target="_blank" rel="noopener noreferrer">Tokamak Network</a></p>
        </div>
        <div className="brutalist-footer-links">
          <h5>{t.footer.resources}</h5>
          <ul>
            <li><a href="https://github.com/tokamak-network/zk-dex-d1-private-voting#readme" target="_blank" rel="noopener noreferrer">{t.footer.whitepaper} <span aria-hidden="true">&#8599;</span></a></li>
            <li><a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer">{t.footer.audit} <span aria-hidden="true">&#8599;</span></a></li>
            <li><a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer">{t.footer.sdk} <span aria-hidden="true">&#8599;</span></a></li>
          </ul>
        </div>
        <div className="brutalist-footer-links">
          <h5>{t.footer.social}</h5>
          <ul>
            <li><a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer">GitHub</a></li>
            <li><a href="https://twitter.com/tokaboratory" target="_blank" rel="noopener noreferrer">X / Twitter</a></li>
            <li><a href="https://discord.gg/tokamaknetwork" target="_blank" rel="noopener noreferrer">Discord</a></li>
          </ul>
        </div>
      </div>
      <div className="brutalist-footer-bottom">
        <span>{t.footer.copyright}</span>
        <span>{t.footer.secured}</span>
      </div>
    </footer>
  )
}
