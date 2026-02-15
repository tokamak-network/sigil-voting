import { useTranslation } from '../i18n'

export function LanguageSwitcher() {
  const { lang, setLang } = useTranslation()

  return (
    <div className="lang-switcher">
      <button
        className={`lang-btn ${lang === 'ko' ? 'active' : ''}`}
        onClick={() => setLang('ko')}
      >
        KO
      </button>
      <span className="lang-divider">|</span>
      <button
        className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </div>
  )
}
