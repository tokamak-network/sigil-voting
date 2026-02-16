import type { Page } from '../types'
import { useTranslation } from '../i18n'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b-2 border-black">
        <div className="flex flex-col lg:flex-row min-h-[80vh]">
          {/* Hero Left */}
          <div className="flex-1 flex flex-col justify-center px-6 md:px-12 lg:px-20 py-16 lg:py-24">
            <div className="bg-primary text-white px-3 py-1 text-xs font-bold uppercase tracking-widest w-fit mb-8">
              {t.landing.badge}
            </div>
            <h1 className="font-display font-black text-5xl md:text-6xl lg:text-7xl leading-none tracking-tight mb-6">
              {t.landing.title.split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-xl mb-10 leading-relaxed">
              {t.landing.subtitle}
            </p>
            <div className="flex items-center gap-4">
              <button
                className="cta-button bg-primary text-white px-8 py-4 text-lg font-display font-black uppercase inline-flex items-center gap-2"
                onClick={() => setCurrentPage('proposals')}
              >
                {t.landing.enterApp} <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
          {/* Hero Right */}
          <div className="relative flex-1 bg-black flex items-center justify-center py-16 lg:py-0 overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-1/4 left-0 right-0 h-px bg-white" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
              <div className="absolute top-3/4 left-0 right-0 h-px bg-white" />
            </div>
            <div className="font-display font-black text-7xl md:text-8xl lg:text-9xl text-white tracking-tighter select-none">
              SIGIL
            </div>
            <div className="absolute bottom-8 right-8 text-right">
              <span className="block font-mono text-3xl font-bold text-white/30">2026</span>
              <span className="block text-xs uppercase tracking-widest text-white/50 mt-1">{t.landing.heroVersion}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="technical-card bg-white p-6">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">shield_person</span>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">{t.landing.features.privacy.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t.landing.features.privacy.desc}</p>
            </div>
          </div>
          <div className="technical-card bg-white p-6">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">lock_open_right</span>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">{t.landing.features.coercion.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t.landing.features.coercion.desc}</p>
            </div>
          </div>
          <div className="technical-card bg-white p-6">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">balance</span>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">{t.landing.features.fairness.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t.landing.features.fairness.desc}</p>
            </div>
          </div>
          <div className="technical-card bg-white p-6">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">functions</span>
            <div>
              <h3 className="font-display font-bold text-lg mb-2">{t.landing.features.verified.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t.landing.features.verified.desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Voting Lifecycle Section */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t-2 border-black" id="how-it-works">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
          <h2 className="font-display font-black uppercase italic text-4xl md:text-5xl">{t.landing.lifecycle.title}</h2>
          <span className="bg-primary text-white px-3 py-1 text-xs font-bold uppercase tracking-widest w-fit">{t.landing.lifecycle.label}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative border-2 border-black bg-white p-8 overflow-hidden">
            <span className="absolute -top-4 -right-2 font-display font-black text-[8rem] leading-none text-black/5 select-none">1</span>
            <h3 className="font-display font-bold text-xl mb-3 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white text-sm font-bold font-mono">1</span>
              {t.landing.lifecycle.step1.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.lifecycle.step1.desc}</p>
          </div>
          <div className="relative border-2 border-black bg-white p-8 overflow-hidden">
            <span className="absolute -top-4 -right-2 font-display font-black text-[8rem] leading-none text-black/5 select-none">2</span>
            <h3 className="font-display font-bold text-xl mb-3 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white text-sm font-bold font-mono">2</span>
              {t.landing.lifecycle.step2.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.lifecycle.step2.desc}</p>
          </div>
          <div className="relative border-2 border-black bg-white p-8 overflow-hidden">
            <span className="absolute -top-4 -right-2 font-display font-black text-[8rem] leading-none text-black/5 select-none">3</span>
            <h3 className="font-display font-bold text-xl mb-3 flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-primary text-white text-sm font-bold font-mono">3</span>
              {t.landing.lifecycle.step3.title}
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.lifecycle.step3.desc}</p>
          </div>
        </div>
      </section>

      {/* Why MACI Section */}
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24 border-t-2 border-black" id="why-maci">
        <div className="mb-12">
          <h2 className="font-display font-black uppercase italic text-4xl md:text-5xl">{t.landing.whyMaci.title}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="technical-card-heavy bg-white p-8">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">lock_reset</span>
            <h3 className="font-display font-bold text-xl mb-3">{t.landing.whyMaci.anti.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.whyMaci.anti.desc}</p>
          </div>
          <div className="technical-card-heavy bg-white p-8">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">visibility_off</span>
            <h3 className="font-display font-bold text-xl mb-3">{t.landing.whyMaci.privacy.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.whyMaci.privacy.desc}</p>
          </div>
          <div className="technical-card-heavy bg-white p-8">
            <span className="material-symbols-outlined text-primary text-3xl mb-4 block">verified</span>
            <h3 className="font-display font-bold text-xl mb-3">{t.landing.whyMaci.verify.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t.landing.whyMaci.verify.desc}</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 border-t-2 border-black bg-black text-white text-center">
        <h2 className="font-display font-black uppercase italic text-3xl md:text-5xl mb-10 max-w-3xl mx-auto">{t.landing.cta.title}</h2>
        <button
          className="cta-button bg-primary text-white px-8 py-4 text-lg font-display font-black uppercase mb-8"
          onClick={() => setCurrentPage('proposals')}
        >
          {t.landing.cta.button}
        </button>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/60 font-mono">
          <span className="flex items-center gap-1">{t.landing.cta.step1} <span className="material-symbols-outlined text-base">arrow_forward</span></span>
          <span className="flex items-center gap-1">{t.landing.cta.step2} <span className="material-symbols-outlined text-base">arrow_forward</span></span>
          <span className="text-primary font-bold">{t.landing.cta.step3}</span>
        </div>
      </section>
    </div>
  )
}
