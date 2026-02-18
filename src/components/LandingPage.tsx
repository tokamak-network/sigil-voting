import type { Page } from '../types'
import { useTranslation } from '../i18n'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  const { t } = useTranslation()

  const titleLines = t.landing.title.split('\n')

  return (
    <div className="w-full border-x-0 min-h-screen">
      {/* ─── Hero Section ─── */}
      <section className="grid grid-cols-12 border-b-2 border-black">
        {/* Hero Left */}
        <div className="col-span-12 lg:col-span-5 p-12 flex flex-col justify-between border-r-0 lg:border-r-2 border-black bg-white">
          <div>
            <div className="inline-block border-2 border-black px-3 py-1 mb-10">
              <span className="font-mono text-xs font-bold uppercase tracking-widest">{t.landing.badge}</span>
            </div>
            <h1 className="font-display text-6xl md:text-7xl font-bold leading-none mb-8 tracking-tighter uppercase">
              {titleLines[0]}<br />
              <span className="text-primary">{titleLines[1]}</span>
            </h1>
            <div className="space-y-4 max-w-sm mb-12">
              <p className="text-lg font-medium leading-tight">{t.landing.subtitle}</p>
              <p className="text-slate-500 text-sm font-mono uppercase">{t.landing.heroStatus}_</p>
            </div>
          </div>
          <div>
            <button
              className="bg-primary text-white w-full py-6 border-2 border-black font-bold text-xl flex items-center justify-center gap-4 hover:bg-blue-700 transition-colors uppercase tracking-[0.2em]"
              onClick={() => setCurrentPage('proposals')}
            >
              {t.landing.enterApp}
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Hero Right — bg-primary (blue) */}
        <div className="col-span-12 lg:col-span-7 bg-primary p-12 relative overflow-hidden flex flex-col justify-between min-h-[600px]">
          <div className="relative z-10 flex justify-between items-start">
            <div className="font-mono text-white text-xs font-bold space-y-1">
              <p>{t.landing.established}</p>
              <p>{t.landing.heroVersion.toUpperCase()}</p>
            </div>
            <div className="w-16 h-16 border-2 border-white flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-3xl">terminal</span>
            </div>
          </div>
          <div className="relative z-0 pointer-events-none">
            <div className="text-[14rem] font-display font-bold text-white leading-none tracking-tighter opacity-90 -ml-4">SIGIL</div>
          </div>
          <div className="relative z-10 grid grid-cols-2 gap-4">
            <div className="p-6 bg-black border-2 border-white text-white">
              <p className="font-mono text-xs mb-2 text-primary">{t.landing.heroLabel1}</p>
              <h3 className="font-bold text-lg uppercase mb-2">{t.landing.zeroExposure.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{t.landing.zeroExposure.desc}</p>
            </div>
            <div className="p-6 bg-black border-2 border-white text-white">
              <p className="font-mono text-xs mb-2 text-primary">{t.landing.heroLabel2}</p>
              <h3 className="font-bold text-lg uppercase mb-2">{t.landing.maciSecured.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{t.landing.maciSecured.desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="grid grid-cols-2 md:grid-cols-4 border-b-2 border-black">
        {[
          { count: t.landing.stats.testsCount, label: t.landing.stats.testsLabel, icon: 'group' },
          { count: t.landing.stats.contractsCount, label: t.landing.stats.contractsLabel, icon: 'schedule' },
          { count: t.landing.stats.propertiesCount, label: t.landing.stats.propertiesLabel, icon: 'security' },
          { count: t.landing.stats.licenseCount, label: t.landing.stats.licenseLabel, icon: 'code' },
        ].map((stat, i) => (
          <div
            key={i}
            className={`p-8 flex flex-col items-center text-center ${i < 3 ? 'border-r-0 md:border-r-2' : ''} ${i < 2 ? 'border-b-2 md:border-b-0' : ''} border-black`}
          >
            <span className="material-symbols-outlined text-primary text-2xl mb-3">{stat.icon}</span>
            <span className="font-display text-4xl md:text-5xl font-black italic tracking-tighter">{stat.count}</span>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500 mt-2">{stat.label}</span>
          </div>
        ))}
      </section>

      {/* ─── Core Features Section ─── */}
      <section className="border-b-2 border-black">
        {/* Section Header — bg-black text-white */}
        <div className="p-6 border-b-2 border-black bg-black text-white flex justify-between items-center">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.landing.coreFeatures}
          </h2>
          <span className="material-symbols-outlined">lock</span>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4">
          {/* Privacy */}
          <div className="p-8 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">encrypted</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight group-hover:text-white transition-colors">
              {t.landing.features.privacy.title}
            </h3>
            <p className="text-base font-medium leading-relaxed group-hover:text-white/90 transition-colors">{t.landing.features.privacy.desc}</p>
          </div>

          {/* Coercion */}
          <div className="p-8 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">gpp_maybe</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight group-hover:text-white transition-colors">
              {t.landing.features.coercion.title}
            </h3>
            <p className="text-base font-medium leading-relaxed group-hover:text-white/90 transition-colors">{t.landing.features.coercion.desc}</p>
          </div>

          {/* Fairness */}
          <div className="p-8 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">balance</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight group-hover:text-white transition-colors">
              {t.landing.features.fairness.title}
            </h3>
            <p className="text-base font-medium leading-relaxed group-hover:text-white/90 transition-colors">{t.landing.features.fairness.desc}</p>
          </div>

          {/* Verified */}
          <div className="p-8 group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">rule</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight group-hover:text-white transition-colors">
              {t.landing.features.verified.title}
            </h3>
            <p className="text-base font-medium leading-relaxed group-hover:text-white/90 transition-colors">{t.landing.features.verified.desc}</p>
          </div>
        </div>
      </section>

      {/* ─── Operational Flow Section ─── */}
      <section className="border-b-2 border-black">
        {/* Section Header — bg-slate-100 */}
        <div className="p-6 border-b-2 border-black bg-slate-100 flex justify-between items-center">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.landing.operationalFlow}
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {/* Step 1 */}
          <div className="p-10 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black flex flex-col justify-between min-h-[400px]">
            <div>
              <span className="font-mono text-primary font-bold text-xs uppercase tracking-widest mb-4 block">STEP_01</span>
              <h3 className="font-display text-4xl font-bold mb-6 tracking-tighter uppercase">{t.landing.lifecycle.step1.title}</h3>
              <p className="text-base font-medium leading-relaxed">{t.landing.lifecycle.step1.desc}</p>
            </div>
            <div className="border-2 border-black p-4 bg-slate-50 flex items-center justify-center h-32">
              <span className="material-symbols-outlined text-5xl text-slate-400">account_balance_wallet</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-10 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black flex flex-col justify-between min-h-[400px]">
            <div>
              <span className="font-mono text-primary font-bold text-xs uppercase tracking-widest mb-4 block">STEP_02</span>
              <h3 className="font-display text-4xl font-bold mb-6 tracking-tighter uppercase">{t.landing.lifecycle.step2.title}</h3>
              <p className="text-base font-medium leading-relaxed">{t.landing.lifecycle.step2.desc}</p>
            </div>
            <div className="space-y-3">
              <div className="p-4 border-2 border-primary bg-primary/10 flex justify-between items-center">
                <span className="font-mono text-xs font-bold uppercase">{t.landing.optionA}</span>
                <span className="material-symbols-outlined text-primary">check_circle</span>
              </div>
              <div className="p-4 border-2 border-black flex justify-between items-center opacity-40">
                <span className="font-mono text-xs font-bold uppercase">{t.landing.optionB}</span>
                <span className="material-symbols-outlined">radio_button_unchecked</span>
              </div>
            </div>
          </div>

          {/* Step 3 — bg-black text-white */}
          <div className="p-10 flex flex-col justify-between min-h-[400px] bg-black text-white">
            <div>
              <span className="font-mono text-primary font-bold text-xs uppercase tracking-widest mb-4 block">STEP_03</span>
              <h3 className="font-display text-4xl font-bold mb-6 tracking-tighter uppercase">{t.landing.lifecycle.step3.title}</h3>
              <p className="text-base font-medium text-slate-400 leading-relaxed">{t.landing.lifecycle.step3.desc}</p>
            </div>
            <div className="border-2 border-white p-6 bg-slate-900 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-green-400">
                <span className="material-symbols-outlined">verified</span>
                <span className="font-mono text-xs font-bold uppercase">{t.landing.proofVerified}_</span>
              </div>
              <div className="h-1 bg-slate-800 w-full">
                <div className="h-full bg-primary w-[88%]"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Demo Video Section ─── */}
      <section className="border-b-2 border-black">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left: Text */}
          <div className="p-12 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black flex flex-col justify-center">
            <h2 className="font-display text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-8">
              {t.landing.demo.title}
            </h2>
            <p className="text-lg font-medium leading-relaxed text-slate-600 mb-8 max-w-lg">
              {t.landing.demo.subtitle}
            </p>
            <div className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">
              <span className="w-2 h-2 bg-primary"></span>
              {t.landing.demo.note}
            </div>
          </div>

          {/* Right: Flow Diagram */}
          <div className="bg-slate-900 p-8 md:p-12 flex flex-col justify-center min-h-[400px]">
            <div className="space-y-4">
              {([
                { icon: 'account_balance_wallet', label: t.landing.cta.step1, detail: 'MetaMask / WalletConnect', color: 'text-slate-400' },
                { icon: 'enhanced_encryption', label: t.landing.lifecycle.step2.title, detail: 'Poseidon + EdDSA + ECDH', color: 'text-primary' },
                { icon: 'cloud_upload', label: t.landing.demo.stepSubmit, detail: 'AccQueue (Immutable)', color: 'text-primary' },
                { icon: 'verified', label: 'Groth16 Proof', detail: t.landing.demo.stepProof, color: 'text-emerald-400' },
                { icon: 'how_to_vote', label: t.landing.cta.step3, detail: t.landing.demo.stepResult, color: 'text-emerald-400' },
              ]).map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 border-2 border-slate-700 flex items-center justify-center shrink-0">
                    <span className={`material-symbols-outlined text-lg ${step.color}`}>{step.icon}</span>
                  </div>
                  <div className="flex-1 border-b border-slate-800 pb-3">
                    <p className="font-mono text-sm font-bold text-white">{step.label}</p>
                    <p className="font-mono text-xs text-slate-500">{step.detail}</p>
                  </div>
                  {i < 4 && <span className="material-symbols-outlined text-slate-700 text-sm shrink-0">arrow_downward</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Why SIGIL Section ─── */}
      <section className="grid grid-cols-12 border-b-2 border-black">
        {/* Left: col-span-8 */}
        <div className="col-span-12 lg:col-span-8 p-12 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black">
          <h2 className="font-display text-5xl font-bold mb-12 uppercase tracking-tight">
            {t.landing.whyMaci.title}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Coercion Resistance */}
            <div className="p-8 border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <h4 className="font-bold text-lg mb-4 uppercase tracking-widest flex items-center gap-2">
                <span className="w-3 h-3 bg-primary"></span>
                {t.landing.whyMaci.anti.title}
              </h4>
              <p className="text-base leading-relaxed">{t.landing.whyMaci.anti.desc}</p>
            </div>

            {/* True Secret Voting */}
            <div className="p-8 border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <h4 className="font-bold text-lg mb-4 uppercase tracking-widest flex items-center gap-2">
                <span className="w-3 h-3 bg-primary"></span>
                {t.landing.whyMaci.privacy.title}
              </h4>
              <p className="text-base leading-relaxed">{t.landing.whyMaci.privacy.desc}</p>
            </div>

            {/* Whale Resistance — col-span-2 */}
            <div className="col-span-1 md:col-span-2 p-8 border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="w-20 h-20 bg-primary border-2 border-black flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-4xl">analytics</span>
                </div>
                <div>
                  <h4 className="font-bold text-xl mb-2 uppercase tracking-widest">{t.landing.whyMaci.verify.title}</h4>
                  <p className="text-base leading-relaxed max-w-2xl">{t.landing.whyMaci.verify.desc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: col-span-4, Terminal Access */}
        <div className="col-span-12 lg:col-span-4 p-12 bg-slate-50">
          <h3 className="font-mono text-sm font-bold mb-8 uppercase tracking-widest border-b-2 border-black pb-4">
            {t.landing.terminalAccess}
          </h3>
          <div className="space-y-4">
            <a
              href="https://maci.pse.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-4 bg-white text-black border-2 border-black hover:bg-primary hover:text-white transition-colors flex justify-between items-center group"
            >
              <span className="font-mono text-xs font-bold uppercase">{t.landing.documentation}</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </a>
            <a
              href="https://github.com/tokamak-network/zk-dex"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-4 bg-white text-black border-2 border-black hover:bg-primary hover:text-white transition-colors flex justify-between items-center group"
            >
              <span className="font-mono text-xs font-bold uppercase">{t.landing.sourceCode}</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </a>
          </div>
          <div className="mt-12 p-6 bg-primary/5 border-l-4 border-primary">
            <p className="font-mono text-xs font-bold text-primary mb-1">Ethereum Sepolia Testnet</p>
            <p className="text-sm text-slate-600">{t.landing.cta.step1} → {t.landing.cta.step2} → {t.landing.cta.step3}</p>
          </div>
        </div>
      </section>

      {/* ─── Comparison Table ─── */}
      <section className="border-b-2 border-black">
        {/* Section Header */}
        <div className="p-6 border-b-2 border-black bg-slate-100 flex justify-between items-center">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.landing.comparison.title}
          </h2>
          <span className="material-symbols-outlined">compare</span>
        </div>

        <div className="p-12">
          <p className="text-lg font-medium text-slate-600 mb-10 max-w-2xl">{t.landing.comparison.subtitle}</p>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-black text-sm">
              <thead>
                <tr className="bg-black text-white">
                  <th className="p-4 text-left font-mono font-bold uppercase tracking-wider border-r-2 border-slate-700">{t.landing.comparison.feature}</th>
                  <th className="p-4 text-center font-mono font-bold uppercase tracking-wider border-r-2 border-slate-700 bg-primary">SIGIL</th>
                  <th className="p-4 text-center font-mono font-bold uppercase tracking-wider border-r-2 border-slate-700">Snapshot</th>
                  <th className="p-4 text-center font-mono font-bold uppercase tracking-wider border-r-2 border-slate-700">Aragon</th>
                  <th className="p-4 text-center font-mono font-bold uppercase tracking-wider border-r-2 border-slate-700">Tally</th>
                  <th className="p-4 text-center font-mono font-bold uppercase tracking-wider">Vocdoni</th>
                </tr>
              </thead>
              <tbody>
                {([
                  {
                    feature: t.landing.comparison.permanentPrivacy,
                    values: [t.landing.comparison.yes, t.landing.comparison.postReveal, t.landing.comparison.yes, t.landing.comparison.no, t.landing.comparison.partial],
                    highlights: [true, false, true, false, false],
                  },
                  {
                    feature: t.landing.comparison.antiBribery,
                    values: [t.landing.comparison.yes, t.landing.comparison.no, t.landing.comparison.demoStage, t.landing.comparison.no, t.landing.comparison.no],
                    highlights: [true, false, false, false, false],
                  },
                  {
                    feature: t.landing.comparison.quadraticVoting,
                    values: [t.landing.comparison.yes, t.landing.comparison.plugin, t.landing.comparison.no, t.landing.comparison.no, t.landing.comparison.no],
                    highlights: [true, false, false, false, false],
                  },
                  {
                    feature: t.landing.comparison.onChainVerify,
                    values: [t.landing.comparison.yes, t.landing.comparison.offchain, t.landing.comparison.yes, t.landing.comparison.yes, t.landing.comparison.ownChain],
                    highlights: [true, false, true, true, false],
                  },
                  {
                    feature: t.landing.comparison.automation,
                    values: [t.landing.comparison.yes, t.landing.comparison.yes, t.landing.comparison.demoStage, t.landing.comparison.yes, t.landing.comparison.yes],
                    highlights: [true, true, false, true, true],
                  },
                ] as const).map((row, i) => (
                  <tr key={i} className={`border-t-2 border-black ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <td className="p-4 font-bold uppercase text-xs tracking-wider border-r-2 border-black">{row.feature}</td>
                    {row.values.map((val, j) => (
                      <td
                        key={j}
                        className={`p-4 text-center border-r-2 border-black last:border-r-0 font-mono font-bold text-xs uppercase ${
                          j === 0 ? 'bg-primary/5' : ''
                        }`}
                      >
                        {row.highlights[j] ? (
                          <span className="text-emerald-600 flex items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            {val}
                          </span>
                        ) : val === t.landing.comparison.no ? (
                          <span className="text-red-400 flex items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-sm">cancel</span>
                            {val}
                          </span>
                        ) : (
                          <span className="text-slate-400">{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom note */}
          <div className="mt-6 flex items-center gap-3">
            <span className="w-3 h-3 bg-primary"></span>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">{t.landing.comparison.onlyStack}</p>
          </div>
        </div>
      </section>

      {/* ─── Integration Section ─── */}
      <section className="border-b-2 border-black">
        {/* Section Header */}
        <div className="p-6 border-b-2 border-black bg-primary text-white flex justify-between items-center">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.landing.sdkIntegration}
          </h2>
          <span className="font-mono text-xs font-bold uppercase tracking-widest border border-white px-3 py-1">
            {t.landing.integration.comingSoon}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left: Title + Trust Badges */}
          <div className="p-12 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black flex flex-col justify-between">
            <div>
              <h2 className="font-display text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-8">
                {t.landing.integration.title.split('\n').map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <span className="text-primary">{line}</span> : line}
                    {i === 0 && <br />}
                  </span>
                ))}
              </h2>
              <p className="text-lg font-medium leading-relaxed max-w-md mb-12">
                {t.landing.integration.subtitle}
              </p>
            </div>

            {/* Trust Badges */}
            <div>
              <h4 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
                {t.landing.integration.trustTitle}
              </h4>
              <div className="space-y-3">
                {[t.landing.integration.trust1, t.landing.integration.trust2, t.landing.integration.trust3, t.landing.integration.trust4].map((trust, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span className="text-base font-medium">{trust}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Code Steps */}
          <div className="p-0">
            {[
              { num: '01', title: t.landing.integration.step1Title, code: t.landing.integration.step1Code, desc: t.landing.integration.step1Desc },
              { num: '02', title: t.landing.integration.step2Title, code: t.landing.integration.step2Code, desc: t.landing.integration.step2Desc },
              { num: '03', title: t.landing.integration.step3Title, code: t.landing.integration.step3Code, desc: t.landing.integration.step3Desc },
            ].map((step, i) => (
              <div key={i} className={`p-8 ${i < 2 ? 'border-b-2 border-black' : ''}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 bg-black text-white flex items-center justify-center font-mono font-bold text-xs">
                    {step.num}
                  </span>
                  <span className="font-bold uppercase tracking-wider text-sm">{step.title}</span>
                </div>
                <pre className="bg-slate-900 text-green-400 p-4 font-mono text-sm mb-3 overflow-x-auto whitespace-pre-wrap">
                  {step.code}
                </pre>
                <p className="text-base text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="border-b-2 border-black">
        <div className="p-6 border-b-2 border-black bg-slate-100 flex justify-between items-center">
          <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.landing.faq.title}
          </h2>
          <span className="material-symbols-outlined">help</span>
        </div>
        <div className="p-12">
          <p className="text-lg font-medium text-slate-600 mb-10 max-w-2xl">{t.landing.faq.subtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-2 border-black">
            {([
              { q: t.landing.faq.q1, a: t.landing.faq.a1 },
              { q: t.landing.faq.q2, a: t.landing.faq.a2 },
              { q: t.landing.faq.q3, a: t.landing.faq.a3 },
              { q: t.landing.faq.q4, a: t.landing.faq.a4 },
              { q: t.landing.faq.q5, a: t.landing.faq.a5 },
              { q: t.landing.faq.q6, a: t.landing.faq.a6 },
            ]).map((item, i) => (
              <div
                key={i}
                className={`p-8 ${i % 2 === 0 ? 'border-r-0 md:border-r-2' : ''} ${i < 4 ? 'border-b-2' : i < 5 && i % 2 === 0 ? 'border-b-2 md:border-b-0' : ''} border-black`}
              >
                <h4 className="font-bold text-sm uppercase tracking-wide mb-4 flex items-start gap-3">
                  <span className="w-6 h-6 bg-primary text-white flex items-center justify-center font-mono text-xs shrink-0 mt-0.5">Q</span>
                  {item.q}
                </h4>
                <p className="text-base text-slate-600 leading-relaxed pl-9">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="bg-black text-white p-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
          <div className="absolute top-0 left-0 p-8 font-display font-bold text-9xl">GOVERN</div>
          <div className="absolute bottom-0 right-0 p-8 font-display font-bold text-9xl">PROTECT</div>
        </div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-12">
          <h2 className="font-display text-5xl md:text-6xl font-bold uppercase tracking-tighter leading-none">
            {t.landing.cta.title}
          </h2>
          <div className="flex items-center justify-center gap-4 font-mono text-xs font-bold uppercase tracking-widest text-slate-400">
            <span>{t.landing.cta.step1}</span>
            <span className="material-symbols-outlined text-primary text-sm">arrow_forward</span>
            <span>{t.landing.cta.step2}</span>
            <span className="material-symbols-outlined text-primary text-sm">arrow_forward</span>
            <span>{t.landing.cta.step3}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <button
              className="bg-primary text-white px-12 py-6 border-2 border-white font-bold text-lg hover:bg-blue-700 transition-all uppercase tracking-[0.2em]"
              onClick={() => setCurrentPage('proposals')}
            >
              {t.landing.cta.button}
            </button>
            <a
              href="mailto:monica@tokamak.network"
              className="bg-transparent text-white px-12 py-6 border-2 border-white font-bold text-lg hover:bg-white hover:text-black transition-all uppercase tracking-[0.2em]"
            >
              {t.landing.contactSales}
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
