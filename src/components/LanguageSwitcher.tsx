import { useTranslation } from '../i18n'

export function LanguageSwitcher() {
  const { lang, setLang } = useTranslation()

  return (
    <div className="flex border-2 border-black overflow-hidden" role="group" aria-label="Language selection">
      <button
        className={`px-3 py-1 text-xs font-bold ${lang === 'en' ? 'bg-black text-white' : 'hover:bg-slate-100'}`}
        onClick={() => setLang('en')}
        aria-label="Switch to English"
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <button
        className={`px-3 py-1 text-xs font-bold ${lang === 'ko' ? 'bg-black text-white' : 'hover:bg-slate-100'}`}
        onClick={() => setLang('ko')}
        aria-label="한국어로 전환"
        aria-pressed={lang === 'ko'}
      >
        KR
      </button>
    </div>
  )
}
