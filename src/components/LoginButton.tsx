'use client'

import { useConnect } from 'wagmi'
import { injected } from '@wagmi/core'
import { usePrivySafe } from '../hooks/usePrivySafe'
import { isPrivyEnabled } from '../wagmi'
import { useTranslation } from '../i18n'

interface LoginButtonProps {
  className?: string
}

export function LoginButton({ className }: LoginButtonProps) {
  const { login } = usePrivySafe()
  const { connect } = useConnect()
  const { t } = useTranslation()

  const handleClick = () => {
    if (isPrivyEnabled) {
      login()
    } else {
      connect({ connector: injected() })
    }
  }

  return (
    <button
      onClick={handleClick}
      className={className || 'bg-primary text-white font-display font-bold px-6 py-3 text-sm hover:translate-x-1 hover:-translate-y-1 transition-transform border-2 border-black uppercase'}
    >
      {isPrivyEnabled ? t.privy.loginButton : t.header.connect}
    </button>
  )
}
