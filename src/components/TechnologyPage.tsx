import type { Page } from '../types'
import { useTranslation } from '../i18n'

interface TechnologyPageProps {
  setCurrentPage: (page: Page) => void
}

export function TechnologyPage({ setCurrentPage }: TechnologyPageProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen">
      {/* Hero: 12-col grid */}
      <section className="grid grid-cols-12 border-b-2 border-black overflow-hidden">
        <div className="col-span-12 lg:col-span-8 p-12 lg:p-24 border-r-0 lg:border-r-2 border-black">
          <div className="inline-block border-2 border-primary px-3 py-1 mb-6">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
              {t.technology.heroBadge}
            </span>
          </div>
          <h1 className="font-display text-6xl md:text-7xl font-black leading-none mb-10 tracking-tighter uppercase italic">
            {t.technology.title.split('\n').map((line, i) => (
              <span key={i}>
                {line.includes('기술') || line.includes('Technology') ? (
                  <>
                    {line.split(/(기술|Technology)/i).map((part, j) =>
                      /기술|Technology/i.test(part)
                        ? <span key={j} className="text-primary">{part}</span>
                        : <span key={j}>{part}</span>
                    )}
                  </>
                ) : line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>
          <p className="text-xl md:text-2xl font-medium leading-tight max-w-2xl text-slate-700">
            {t.technology.subtitle}
          </p>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-primary p-12 flex flex-col justify-end">
          <div className="space-y-6">
            <a href="#pillar-1" className="block border-t-2 border-white pt-4 hover:opacity-80 transition-opacity">
              <p className="font-mono text-white font-bold italic">01. {t.technology.zkVoting.badge.toUpperCase()}</p>
            </a>
            <a href="#pillar-2" className="block border-t-2 border-white pt-4 hover:opacity-80 transition-opacity">
              <p className="font-mono text-white font-bold italic">02. {t.technology.quadratic.badge.toUpperCase()}</p>
            </a>
            <a href="#pillar-3" className="block border-t-2 border-white pt-4 hover:opacity-80 transition-opacity">
              <p className="font-mono text-white font-bold italic">03. {t.technology.antiCollusion.badge.toUpperCase()}</p>
            </a>
          </div>
        </div>
      </section>

      {/* Section 01: ZK Private Voting */}
      <section className="border-b-2 border-black" id="pillar-1">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left: Explanation */}
          <div className="p-12 border-b-2 md:border-b-0 md:border-r-2 border-black">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-mono font-bold text-xl italic">
                01
              </div>
              <h2 className="font-display text-4xl font-bold tracking-tight uppercase italic">
                {t.technology.zkVoting.title}
              </h2>
            </div>
            <div className="mb-8">
              <h3 className="font-mono text-sm font-bold text-primary uppercase mb-4 tracking-widest">
                [ {t.technology.zkVoting.howTitle} ]
              </h3>
              <p className="text-lg leading-relaxed mb-6">
                {t.technology.zkVoting.desc}
              </p>
              <ul className="space-y-4 font-mono text-sm">
                {[t.technology.zkVoting.point1, t.technology.zkVoting.point2, t.technology.zkVoting.point3].map((point, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary text-sm mt-1">check_circle</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Right: Visual Diagram */}
          <div className="p-12 flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-md border-2 border-black p-8 bg-white font-mono text-xs space-y-4">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="opacity-50">INPUT_DATA</span>
                <span className="font-bold">VOTE_OPTION_A</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2 text-primary">
                <span className="opacity-50">SECRET_NONCE</span>
                <span className="font-bold">x8f9...32a1</span>
              </div>
              <div className="py-4 flex justify-center">
                <span className="material-symbols-outlined text-4xl">keyboard_double_arrow_down</span>
              </div>
              <div className="p-4 bg-black text-white break-all">
                <p className="mb-1 text-xs opacity-50 uppercase">{t.technology.zkVoting.commitLabel} (On-Chain)</p>
                0x4a2e8c1f9b3d7e5a6012c8b7f3d9e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 02: Quadratic Voting */}
      <section className="border-b-2 border-black" id="pillar-2">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left: Cost Visual (reversed order on desktop) */}
          <div className="p-12 border-b-2 md:border-b-0 md:border-r-2 border-black order-2 md:order-1 bg-slate-50">
            <div className="grid grid-cols-1 gap-6">
              <div className="p-6 border-2 border-black bg-white">
                <p className="font-mono text-xs text-primary font-bold mb-4 uppercase">
                  {t.technology.quadratic.formula}
                </p>
                <div className="space-y-4 font-mono text-sm">
                  {[
                    { label: t.technology.quadratic.vote1, credits: `1 ${t.technology.quadratic.creditUnit}` },
                    { label: t.technology.quadratic.vote2, credits: `4 ${t.technology.quadratic.creditUnit}` },
                    { label: t.technology.quadratic.vote3, credits: `9 ${t.technology.quadratic.creditUnit}` },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border border-slate-200">
                      <span>{item.label}</span>
                      <span className="font-bold">{item.credits}</span>
                    </div>
                  ))}
                  <div className="h-1 bg-slate-200 w-full">
                    <div className="h-full bg-primary w-[33%]" />
                  </div>
                </div>
              </div>
              <div className="text-center font-bold italic text-slate-400 text-xs uppercase tracking-widest">
                {t.technology.quadratic.example}
              </div>
            </div>
          </div>
          {/* Right: Explanation */}
          <div className="p-12 order-1 md:order-2">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-mono font-bold text-xl italic">
                02
              </div>
              <h2 className="font-display text-4xl font-bold tracking-tight uppercase italic">
                {t.technology.quadratic.title}
              </h2>
            </div>
            <p className="text-lg mb-8 leading-relaxed">
              {t.technology.quadratic.desc}
            </p>
            <div className="bg-primary/5 p-6 border-l-4 border-primary">
              <h4 className="font-mono text-xs font-bold text-primary mb-2">{t.technology.quadratic.howTitle}:</h4>
              <p className="font-mono text-base">{t.technology.quadratic.howDesc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 03: MACI Anti-Collusion */}
      <section className="border-b-2 border-black" id="pillar-3">
        <div className="p-12">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center font-mono font-bold text-xl italic">
              03
            </div>
            <h2 className="font-display text-4xl font-bold tracking-tight uppercase italic">
              {t.technology.antiCollusion.title} — {t.technology.antiCollusion.badge}
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-2 border-black">
            <div className="p-8 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black">
              <span className="font-mono text-xs font-bold text-primary italic mb-4 block">STEP_01</span>
              <h4 className="font-bold mb-4 uppercase italic">{t.technology.antiCollusion.step1Title} ({t.technology.antiCollusion.scenario})</h4>
              <p className="text-base text-slate-600">{t.technology.antiCollusion.step1}</p>
            </div>
            <div className="p-8 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black bg-slate-50">
              <span className="font-mono text-xs font-bold text-primary italic mb-4 block">STEP_02</span>
              <h4 className="font-bold mb-4 uppercase italic">{t.technology.antiCollusion.step2Title} (EdDSA)</h4>
              <p className="text-base text-slate-600">{t.technology.antiCollusion.step2}</p>
            </div>
            <div className="p-8">
              <span className="font-mono text-xs font-bold text-primary italic mb-4 block">STEP_03</span>
              <h4 className="font-bold mb-4 uppercase italic">{t.technology.antiCollusion.step3Title} (Final)</h4>
              <p className="text-base text-slate-600">{t.technology.antiCollusion.step3}</p>
            </div>
          </div>
          <p className="mt-8 font-mono text-xs text-center uppercase tracking-widest opacity-50">
            {t.technology.antiCollusion.partnership}
          </p>
        </div>
      </section>

      {/* Stronger Together */}
      <section className="p-12 lg:p-24 bg-black text-white text-center border-b-2 border-black">
        <h2 className="font-display text-5xl md:text-7xl font-black italic uppercase mb-8 tracking-tighter">
          {t.technology.combined.title}
        </h2>
        <p className="text-xl max-w-3xl mx-auto mb-12 font-medium leading-relaxed">
          {t.technology.combined.desc}
        </p>
        <div className="inline-flex gap-4 border-2 border-white p-2">
          <div className="w-4 h-4 bg-primary" />
          <div className="w-4 h-4 bg-primary" />
          <div className="w-4 h-4 bg-primary" />
        </div>
      </section>

      {/* Technical Specifications */}
      <section className="border-b-2 border-black">
        <div className="p-6 border-b-2 border-black bg-slate-100">
          <h3 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.technology.specs.title} — {t.technology.specs.subtitle}
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {([
            { ...t.technology.specs.proofTime, icon: 'timer' },
            { ...t.technology.specs.gasPerBatch, icon: 'local_gas_station' },
            { ...t.technology.specs.hashFunction, icon: 'tag' },
            { ...t.technology.specs.keyCurve, icon: 'key' },
            { ...t.technology.specs.cipherSuite, icon: 'lock' },
            { ...t.technology.specs.treeDepth, icon: 'account_tree' },
          ]).map((spec, i) => (
            <div
              key={i}
              className={`p-8 ${i % 3 < 2 ? 'border-r-0 lg:border-r-2' : ''} ${i < 3 ? 'border-b-2' : ''} ${i % 2 === 0 && i < 4 ? 'md:border-r-2 lg:border-r-2' : i % 2 === 0 ? 'md:border-r-2 lg:border-r-0' : ''} border-black`}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary">{spec.icon}</span>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-400">{spec.label}</span>
              </div>
              <p className="font-display text-3xl font-black italic tracking-tight mb-2">{spec.value}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{spec.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* System Architecture */}
      <section className="border-b-2 border-black">
        <div className="p-12">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-4">
              {t.technology.architecture.title}
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">{t.technology.architecture.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border-2 border-black">
            {([
              { ...t.technology.architecture.step1, num: '01', color: 'bg-primary' },
              { ...t.technology.architecture.step2, num: '02', color: 'bg-black' },
              { ...t.technology.architecture.step3, num: '03', color: 'bg-black' },
              { ...t.technology.architecture.step4, num: '04', color: 'bg-primary' },
            ]).map((step, i) => (
              <div key={i} className={`p-6 ${i < 3 ? 'border-r-0 md:border-r-2' : ''} border-b-2 md:border-b-0 border-black relative`}>
                <div className={`w-8 h-8 ${step.color} text-white flex items-center justify-center font-mono text-xs font-bold mb-4`}>
                  {step.num}
                </div>
                <h4 className="font-mono font-bold text-sm uppercase tracking-wider mb-3">{step.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
                {i < 3 && (
                  <div className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-6 h-6 bg-white border-2 border-black items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-sm">arrow_forward</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-xs text-center uppercase tracking-widest text-slate-400">
            MACI → POLL → MESSAGE PROCESSOR → TALLY
          </p>
        </div>
      </section>

      {/* For Developers */}
      <section className="border-b-2 border-black">
        <div className="p-6 border-b-2 border-black bg-black text-white flex justify-between items-center">
          <h3 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.technology.developers.title.replace('\n', ' ')}
          </h3>
          <span className="material-symbols-outlined">code</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: SDK + Widget + API */}
          <div className="lg:col-span-8 border-r-0 lg:border-r-2 border-b-2 lg:border-b-0 border-black">
            <div className="p-12">
              <h2 className="font-display text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">
                {t.technology.developers.title.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i === 0 && <br />}
                  </span>
                ))}
              </h2>
              <p className="text-lg text-slate-600 mb-12 max-w-xl">
                {t.technology.developers.subtitle}
              </p>

              {/* 3 Integration Options */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-black">
                {[
                  { icon: 'package_2', title: t.technology.developers.sdkTitle, desc: t.technology.developers.sdkDesc, code: t.technology.developers.sdkCode },
                  { icon: 'widgets', title: t.technology.developers.widgetTitle, desc: t.technology.developers.widgetDesc, code: t.technology.developers.widgetCode },
                  { icon: 'terminal', title: t.technology.developers.apiTitle, desc: t.technology.developers.apiDesc, code: t.technology.developers.apiCode },
                ].map((item, i) => (
                  <div key={i} className={`p-6 ${i < 2 ? 'border-r-0 md:border-r-2' : ''} border-b-2 md:border-b-0 border-black`}>
                    <div className="w-10 h-10 bg-primary text-white flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    </div>
                    <h4 className="font-bold uppercase text-sm tracking-wider mb-3">{item.title}</h4>
                    <p className="text-base text-slate-600 leading-relaxed mb-4">{item.desc}</p>
                    <pre className="bg-slate-900 text-green-400 p-3 font-mono text-xs leading-relaxed overflow-x-auto">
                      {item.code}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            {/* Use Cases */}
            <div className="p-12 border-t-2 border-black bg-slate-50">
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-primary mb-6">
                {t.technology.developers.useCaseTitle}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[t.technology.developers.useCase1, t.technology.developers.useCase2, t.technology.developers.useCase3, t.technology.developers.useCase4].map((uc, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-white border border-slate-200">
                    <span className="material-symbols-outlined text-primary text-sm mt-0.5">arrow_right</span>
                    <span className="text-base font-medium">{uc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Security & Trust */}
          <div className="lg:col-span-4 p-12 flex flex-col justify-between">
            <div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest mb-8 border-b-2 border-black pb-4">
                {t.technology.developers.trustTitle}
              </h3>
              <div className="space-y-6">
                {[t.technology.developers.trust1, t.technology.developers.trust2, t.technology.developers.trust3, t.technology.developers.trust4].map((trust, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary text-base mt-0.5">verified</span>
                    <p className="text-base leading-relaxed">{trust}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-12 p-6 bg-black text-white">
              <p className="font-mono text-xs uppercase tracking-widest mb-2 text-slate-400">Protocol Stack</p>
              <p className="font-mono text-xs leading-relaxed">
                POSEIDON HASH | EDDSA KEYS<br />
                GROTH16 PROOFS | BABY JUBJUB<br />
                DUPLEXSPONGE CIPHER | ECDH
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Guarantees: 7-col grid */}
      <section className="border-b-2 border-black">
        <div className="p-6 border-b-2 border-black bg-slate-100">
          <h3 className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
            {t.technology.properties.title} — {t.technology.properties.subtitle}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 text-center">
          {([
            { key: 'collusion' as const },
            { key: 'receipt' as const },
            { key: 'privacy' as const },
            { key: 'uncensor' as const },
            { key: 'unforge' as const },
            { key: 'nonrepud' as const },
            { key: 'correct' as const },
          ]).map(({ key }, i) => (
            <div
              key={key}
              className={`group p-8 ${i < 6 ? 'border-r-2' : ''} border-b-2 border-black hover:bg-primary transition-colors flex flex-col items-center justify-center gap-2`}
            >
              <p className="font-mono text-xs font-bold group-hover:text-white transition-colors">{t.technology.properties[key].title}</p>
              <p className="font-mono text-xs text-slate-500 uppercase group-hover:text-white/70 transition-colors">{t.technology.properties[key].desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="p-24 bg-white text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <h2 className="font-display text-4xl md:text-5xl font-black uppercase italic tracking-tight">
            {t.technology.cta.title} →
          </h2>
          <button
            className="bg-primary text-white px-12 py-6 border-2 border-black font-bold text-xl hover:translate-x-1 hover:-translate-y-1 transition-transform flex items-center justify-center gap-4 mx-auto uppercase italic"
            onClick={() => setCurrentPage('proposals')}
          >
            {t.technology.cta.button}
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </section>
    </div>
  )
}
