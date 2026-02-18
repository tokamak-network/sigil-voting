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
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest">{t.landing.badge}</span>
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
              <p>EST. 2026</p>
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
              <p className="font-mono text-[10px] mb-2 text-primary">{t.landing.heroLabel1}</p>
              <h3 className="font-bold text-lg uppercase mb-2">{t.landing.zeroExposure.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{t.landing.zeroExposure.desc}</p>
            </div>
            <div className="p-6 bg-black border-2 border-white text-white">
              <p className="font-mono text-[10px] mb-2 text-primary">{t.landing.heroLabel2}</p>
              <h3 className="font-bold text-lg uppercase mb-2">{t.landing.maciSecured.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{t.landing.maciSecured.desc}</p>
            </div>
          </div>
        </div>
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
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight">
              {t.landing.features.privacy.title}
            </h3>
            <p className="text-xs font-medium leading-relaxed uppercase">{t.landing.features.privacy.desc}</p>
          </div>

          {/* Coercion */}
          <div className="p-8 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">gpp_maybe</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight">
              {t.landing.features.coercion.title}
            </h3>
            <p className="text-xs font-medium leading-relaxed uppercase">{t.landing.features.coercion.desc}</p>
          </div>

          {/* Fairness */}
          <div className="p-8 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-black group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">balance</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight">
              {t.landing.features.fairness.title}
            </h3>
            <p className="text-xs font-medium leading-relaxed uppercase">{t.landing.features.fairness.desc}</p>
          </div>

          {/* Verified */}
          <div className="p-8 group hover:bg-primary transition-colors">
            <div className="w-12 h-12 border-2 border-black flex items-center justify-center mb-8 bg-white group-hover:bg-black group-hover:text-white transition-colors">
              <span className="material-symbols-outlined">rule</span>
            </div>
            <h3 className="font-bold text-lg mb-4 uppercase tracking-tight">
              {t.landing.features.verified.title}
            </h3>
            <p className="text-xs font-medium leading-relaxed uppercase">{t.landing.features.verified.desc}</p>
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
              <p className="text-sm font-medium leading-relaxed">{t.landing.lifecycle.step1.desc}</p>
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
              <p className="text-sm font-medium leading-relaxed">{t.landing.lifecycle.step2.desc}</p>
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
              <p className="text-sm font-medium text-slate-400 leading-relaxed">{t.landing.lifecycle.step3.desc}</p>
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
              <p className="text-sm leading-relaxed">{t.landing.whyMaci.anti.desc}</p>
            </div>

            {/* True Secret Voting */}
            <div className="p-8 border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <h4 className="font-bold text-lg mb-4 uppercase tracking-widest flex items-center gap-2">
                <span className="w-3 h-3 bg-primary"></span>
                {t.landing.whyMaci.privacy.title}
              </h4>
              <p className="text-sm leading-relaxed">{t.landing.whyMaci.privacy.desc}</p>
            </div>

            {/* Whale Resistance — col-span-2 */}
            <div className="col-span-1 md:col-span-2 p-8 border-2 border-black hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="w-20 h-20 bg-primary border-2 border-black flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-4xl">analytics</span>
                </div>
                <div>
                  <h4 className="font-bold text-xl mb-2 uppercase tracking-widest">{t.landing.whyMaci.verify.title}</h4>
                  <p className="text-sm leading-relaxed max-w-2xl">{t.landing.whyMaci.verify.desc}</p>
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
              href="https://discord.gg/tokamak"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-4 bg-black text-white border-2 border-black hover:bg-primary transition-colors flex justify-between items-center group"
            >
              <span className="font-mono text-xs font-bold uppercase">{t.landing.connectDiscord}</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </a>
            <a
              href="https://docs.sigil.vote"
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
          <div className="mt-12 p-6 border-2 border-dashed border-black opacity-50">
            <p className="font-mono text-[10px] text-center">SIGIL_PROTOCOL :: v2.4<br />VERIFIER :: GROTH16_BN254<br />NETWORK :: ETHEREUM</p>
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
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <button
              className="bg-primary text-white px-12 py-6 border-2 border-white font-bold text-lg hover:bg-blue-700 transition-all uppercase tracking-[0.2em]"
              onClick={() => setCurrentPage('proposals')}
            >
              {t.landing.cta.button}
            </button>
            <a
              href="mailto:contact@tokamak.network"
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
