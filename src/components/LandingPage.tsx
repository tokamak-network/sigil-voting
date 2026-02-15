import type { Page } from '../types'
import { useTranslation } from '../i18n'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  const { t } = useTranslation()

  return (
    <div className="brutalist-landing">
      {/* Hero Section */}
      <section className="brutalist-hero">
        <div className="brutalist-hero-content">
          <div className="brutalist-hero-left">
            <div className="brutalist-badge">
              {t.landing.badge}
            </div>
            <h1 className="brutalist-title">
              {t.landing.title.split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </h1>
            <p className="brutalist-subtitle">
              {t.landing.subtitle}
            </p>
            <div className="brutalist-cta-group">
              <button className="brutalist-btn-primary" onClick={() => setCurrentPage('proposals')}>
                {t.landing.enterApp} <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
          <div className="brutalist-hero-right">
            <div className="brutalist-hero-bg-lines">
              <div className="bg-line"></div>
              <div className="bg-line"></div>
              <div className="bg-line"></div>
            </div>
            <div className="brutalist-hero-text">
              SIGIL
            </div>
            <div className="brutalist-hero-version">
              <span className="version-year">2026</span>
              <span className="version-label">{t.landing.heroVersion}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="brutalist-features">
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">shield_person</span>
          <div>
            <h3>{t.landing.features.privacy.title}</h3>
            <p>{t.landing.features.privacy.desc}</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">lock_open_right</span>
          <div>
            <h3>{t.landing.features.coercion.title}</h3>
            <p>{t.landing.features.coercion.desc}</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">balance</span>
          <div>
            <h3>{t.landing.features.fairness.title}</h3>
            <p>{t.landing.features.fairness.desc}</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">functions</span>
          <div>
            <h3>{t.landing.features.verified.title}</h3>
            <p>{t.landing.features.verified.desc}</p>
          </div>
        </div>
      </section>

      {/* Voting Lifecycle Section */}
      <section className="brutalist-lifecycle" id="how-it-works">
        <div className="brutalist-section-header">
          <h2>{t.landing.lifecycle.title}</h2>
          <span className="brutalist-label">{t.landing.lifecycle.label}</span>
        </div>
        <div className="brutalist-steps">
          <div className="brutalist-step">
            <span className="step-bg-number">1</span>
            <h3>
              <span className="step-number">1</span>
              {t.landing.lifecycle.step1.title}
            </h3>
            <p>{t.landing.lifecycle.step1.desc}</p>
          </div>
          <div className="brutalist-step">
            <span className="step-bg-number">2</span>
            <h3>
              <span className="step-number">2</span>
              {t.landing.lifecycle.step2.title}
            </h3>
            <p>{t.landing.lifecycle.step2.desc}</p>
          </div>
          <div className="brutalist-step">
            <span className="step-bg-number">3</span>
            <h3>
              <span className="step-number">3</span>
              {t.landing.lifecycle.step3.title}
            </h3>
            <p>{t.landing.lifecycle.step3.desc}</p>
          </div>
        </div>
      </section>

      {/* Why MACI Section (replaces old QV comparison) */}
      <section className="brutalist-why-maci" id="why-maci">
        <div className="brutalist-section-header">
          <h2>{t.landing.whyMaci.title}</h2>
        </div>
        <div className="why-maci-cards">
          <div className="why-maci-card">
            <span className="material-symbols-outlined">lock_reset</span>
            <h3>{t.landing.whyMaci.anti.title}</h3>
            <p>{t.landing.whyMaci.anti.desc}</p>
          </div>
          <div className="why-maci-card">
            <span className="material-symbols-outlined">visibility_off</span>
            <h3>{t.landing.whyMaci.privacy.title}</h3>
            <p>{t.landing.whyMaci.privacy.desc}</p>
          </div>
          <div className="why-maci-card">
            <span className="material-symbols-outlined">verified</span>
            <h3>{t.landing.whyMaci.verify.title}</h3>
            <p>{t.landing.whyMaci.verify.desc}</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="brutalist-cta">
        <h2>{t.landing.cta.title}</h2>
        <button
          className="brutalist-cta-button"
          onClick={() => setCurrentPage('proposals')}
        >
          {t.landing.cta.button}
        </button>
        <div className="brutalist-cta-steps">
          <span>{t.landing.cta.step1} <span className="material-symbols-outlined">arrow_forward</span></span>
          <span>{t.landing.cta.step2} <span className="material-symbols-outlined">arrow_forward</span></span>
          <span className="highlight">{t.landing.cta.step3}</span>
        </div>
      </section>
    </div>
  )
}
