import { useTranslation } from '../i18n'

export function LanguageSwitcher() {
  const { lang, setLang } = useTranslation()

  return (
    <div className="lang-switcher" role="group" aria-label="Language selection">
      <button
        className={`lang-btn ${lang === 'ko' ? 'active' : ''}`}
        onClick={() => setLang('ko')}
        aria-label="한국어로 전환"
        aria-pressed={lang === 'ko'}
      >
        KO
      </button>
      <span className="lang-divider" aria-hidden="true">|</span>
      <button
        className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
        aria-label="Switch to English"
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
    </div>
  )
}
