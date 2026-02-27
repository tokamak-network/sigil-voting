'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useTranslation } from '../i18n'

interface LoginButtonProps {
  className?: string
}

export function LoginButton({ className }: LoginButtonProps) {
  const { login } = usePrivy()
  const { t } = useTranslation()

  return (
    <button
      onClick={login}
      className={className || 'bg-primary text-white font-display font-bold px-6 py-3 text-sm hover:translate-x-1 hover:-translate-y-1 transition-transform border-2 border-black uppercase'}
    >
      {t.privy.loginButton}
    </button>
  )
}
