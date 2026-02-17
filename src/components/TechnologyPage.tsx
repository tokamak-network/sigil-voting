import type { Page } from '../types'
import { useTranslation } from '../i18n'

interface TechnologyPageProps {
  setCurrentPage: (page: Page) => void
}

export function TechnologyPage({ setCurrentPage }: TechnologyPageProps) {
  const { t } = useTranslation()

  const properties = [
    { key: 'collusion' as const, icon: 'group_off' },
    { key: 'receipt' as const, icon: 'receipt_long' },
    { key: 'privacy' as const, icon: 'visibility_off' },
    { key: 'uncensor' as const, icon: 'block' },
    { key: 'unforge' as const, icon: 'fingerprint' },
    { key: 'nonrepud' as const, icon: 'gavel' },
    { key: 'correct' as const, icon: 'verified' },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-b-2 border-black">
        <div className="max-w-4xl">
          <div className="bg-black text-white px-3 py-1 text-xs font-bold uppercase tracking-widest w-fit mb-8">
            CRYPTOGRAPHY
          </div>
          <h1 className="font-display font-black text-5xl md:text-6xl lg:text-7xl leading-none tracking-tight mb-6">
            {t.technology.title.split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl leading-relaxed">
            {t.technology.subtitle}
          </p>
        </div>
      </section>

      {/* 1. ZK Private Voting */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-b-2 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left: Explanation */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-6">
                <span className="inline-flex items-center justify-center w-12 h-12 bg-primary text-white">
                  <span className="material-symbols-outlined text-2xl">shield_person</span>
                </span>
                <div>
                  <h2 className="font-display font-black text-3xl md:text-4xl uppercase italic">{t.technology.zkVoting.title}</h2>
                  <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider">{t.technology.zkVoting.badge}</span>
                </div>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                {t.technology.zkVoting.desc}
              </p>
              <div className="technical-border bg-slate-50 p-6">
                <h3 className="font-bold text-sm uppercase tracking-widest mb-4">{t.technology.zkVoting.howTitle}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-6">{t.technology.zkVoting.howDesc}</p>
                <ul className="space-y-3">
                  {[t.technology.zkVoting.point1, t.technology.zkVoting.point2, t.technology.zkVoting.point3].map((point, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="material-symbols-outlined text-emerald-500 text-lg mt-0.5">check_circle</span>
                      <span className="text-gray-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {/* Right: Visual */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm">
                <div className="border-2 border-black p-8 bg-white text-center">
                  <span className="material-symbols-outlined text-6xl text-black/10 block mb-4">lock</span>
                  <div className="font-mono text-xs text-slate-400 mb-2">POSEIDON COMMITMENT</div>
                  <div className="bg-black text-white font-mono text-sm p-4 break-all leading-relaxed">
                    H(choice, power, proposal, salt) = 0x7f3a...
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2 text-emerald-500 text-sm font-bold">
                    <span className="material-symbols-outlined text-lg">verified</span>
                    ZK PROOF VALID
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Quadratic Voting */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-b-2 border-black bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row-reverse gap-12">
            {/* Right: Explanation */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-6">
                <span className="inline-flex items-center justify-center w-12 h-12 bg-primary text-white">
                  <span className="material-symbols-outlined text-2xl">balance</span>
                </span>
                <div>
                  <h2 className="font-display font-black text-3xl md:text-4xl uppercase italic">{t.technology.quadratic.title}</h2>
                  <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider">{t.technology.quadratic.badge}</span>
                </div>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                {t.technology.quadratic.desc}
              </p>
              <div className="technical-border bg-white p-6">
                <h3 className="font-bold text-sm uppercase tracking-widest mb-4">{t.technology.quadratic.howTitle}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{t.technology.quadratic.howDesc}</p>
              </div>
            </div>
            {/* Left: Cost Visual */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm space-y-4">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t.technology.quadratic.example}</div>
                {[
                  { label: t.technology.quadratic.vote1, width: '11%', credits: 1 },
                  { label: t.technology.quadratic.vote2, width: '44%', credits: 4 },
                  { label: t.technology.quadratic.vote3, width: '100%', credits: 9 },
                ].map((item, i) => (
                  <div key={i} className="border-2 border-black bg-white p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono font-bold text-sm">{item.label}</span>
                      <span className="text-xs font-mono text-slate-400">{item.credits} credits</span>
                    </div>
                    <div className="w-full h-6 bg-slate-100">
                      <div
                        className="h-full bg-primary transition-all duration-700"
                        style={{ width: item.width }}
                      />
                    </div>
                  </div>
                ))}
                <div className="text-center pt-2">
                  <span className="font-mono text-xs text-slate-500">cost = votes&sup2;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MACI Anti-Collusion */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-b-2 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left: Explanation */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-6">
                <span className="inline-flex items-center justify-center w-12 h-12 bg-primary text-white">
                  <span className="material-symbols-outlined text-2xl">lock_reset</span>
                </span>
                <div>
                  <h2 className="font-display font-black text-3xl md:text-4xl uppercase italic">{t.technology.antiCollusion.title}</h2>
                  <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider">{t.technology.antiCollusion.badge}</span>
                </div>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed mb-8">
                {t.technology.antiCollusion.desc}
              </p>
              <div className="technical-border bg-slate-50 p-6">
                <h3 className="font-bold text-sm uppercase tracking-widest mb-4">{t.technology.antiCollusion.howTitle}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{t.technology.antiCollusion.howDesc}</p>
              </div>
            </div>
            {/* Right: Scenario */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">{t.technology.antiCollusion.scenario}</div>
                <div className="space-y-4">
                  {[
                    { step: '1', text: t.technology.antiCollusion.step1, icon: 'warning', color: 'text-red-500' },
                    { step: '2', text: t.technology.antiCollusion.step2, icon: 'key', color: 'text-primary' },
                    { step: '3', text: t.technology.antiCollusion.step3, icon: 'check_circle', color: 'text-emerald-500' },
                  ].map((item, i) => (
                    <div key={i} className="border-2 border-black bg-white p-4 flex items-start gap-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-black text-white text-sm font-bold font-mono flex-shrink-0">
                        {item.step}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`material-symbols-outlined text-lg ${item.color}`}>{item.icon}</span>
                        </div>
                        <p className="text-sm text-gray-700">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Combined Strength */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-20 border-b-2 border-black bg-black text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display font-black text-3xl md:text-4xl uppercase italic mb-6">
            {t.technology.combined.title}
          </h2>
          <p className="text-lg text-white/70 leading-relaxed max-w-2xl mx-auto mb-10">
            {t.technology.combined.desc}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="border border-white/20 px-5 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">shield_person</span>
              <span className="font-mono text-sm font-bold">{t.technology.zkVoting.title}</span>
            </div>
            <span className="text-white/30 text-2xl">+</span>
            <div className="border border-white/20 px-5 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">balance</span>
              <span className="font-mono text-sm font-bold">{t.technology.quadratic.title}</span>
            </div>
            <span className="text-white/30 text-2xl">+</span>
            <div className="border border-white/20 px-5 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">lock_reset</span>
              <span className="font-mono text-sm font-bold">{t.technology.antiCollusion.title}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 7 Security Properties */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-b-2 border-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <h2 className="font-display font-black uppercase italic text-4xl md:text-5xl mb-3">
              {t.technology.properties.title}
            </h2>
            <p className="text-sm font-mono text-slate-500 uppercase tracking-wider">
              {t.technology.properties.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {properties.map(({ key, icon }) => (
              <div key={key} className="technical-border bg-white p-5 hover:border-primary transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
                  <h3 className="font-bold text-sm uppercase tracking-wider">{t.technology.properties[key].title}</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{t.technology.properties[key].desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-black text-white text-center">
        <h2 className="font-display font-black uppercase italic text-3xl md:text-5xl mb-8">
          {t.technology.cta.title}
        </h2>
        <button
          className="cta-button bg-primary text-white px-8 py-4 text-lg font-display font-black uppercase"
          onClick={() => setCurrentPage('proposals')}
        >
          {t.technology.cta.button}
        </button>
      </section>
    </div>
  )
}
