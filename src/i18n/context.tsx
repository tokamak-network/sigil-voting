import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Language, Translations } from './types'
import { ko } from './ko'
import { en } from './en'

const translations: Record<Language, Translations> = { ko, en }

interface LanguageContextValue {
  lang: Language
  t: Translations
  setLang: (lang: Language) => void
  toggleLang: () => void
}

const STORAGE_KEY = 'zk-voting-lang'

function getInitialLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'ko' || stored === 'en') return stored
  } catch {
    // localStorage not available
  }
  return 'en'
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang)

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang)
    try {
      localStorage.setItem(STORAGE_KEY, newLang)
    } catch {
      // localStorage not available
    }
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'ko' ? 'en' : 'ko')
  }, [lang, setLang])

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang], setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}
