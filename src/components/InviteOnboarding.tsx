'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useTranslation } from '../i18n'

interface InviteOnboardingProps {
  onReady: () => void
}

type OnboardStep = 'login' | 'wallet' | 'ready'

export function InviteOnboarding({ onReady }: InviteOnboardingProps) {
  const { t } = useTranslation()
  const { authenticated, ready: privyReady } = usePrivy()
  const { wallets } = useWallets()
  const { isConnected } = useAccount()
  const [step, setStep] = useState<OnboardStep>('login')

  useEffect(() => {
    if (!privyReady) return

    if (!authenticated) {
      setStep('login')
      return
    }

    // Authenticated but waiting for embedded wallet
    if (!isConnected || wallets.length === 0) {
      setStep('wallet')
      return
    }

    // Everything ready
    setStep('ready')
    const timer = setTimeout(onReady, 1000)
    return () => clearTimeout(timer)
  }, [authenticated, isConnected, wallets, privyReady, onReady])

  const steps = [
    { key: 'login', label: t.privy.onboardingStep1, done: authenticated },
    { key: 'wallet', label: t.privy.onboardingStep2, done: isConnected && wallets.length > 0 },
    { key: 'ready', label: t.privy.onboardingStep4, done: step === 'ready' },
  ]

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8">
      <span className="material-symbols-outlined text-5xl text-primary" aria-hidden="true">
        rocket_launch
      </span>
      <h2 className="font-display text-2xl font-black uppercase">{t.privy.loginTitle}</h2>
      <p className="text-slate-500 text-center max-w-sm">{t.privy.loginDesc}</p>

      <div className="w-full max-w-xs space-y-3 mt-4">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
              s.done
                ? 'bg-green-500 border-green-500 text-white'
                : step === s.key
                  ? 'bg-primary border-primary text-white animate-pulse'
                  : 'bg-slate-100 border-slate-300 text-slate-400'
            }`}>
              {s.done ? (
                <span className="material-symbols-outlined text-sm">check</span>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-sm font-medium ${
              s.done ? 'text-green-600' : step === s.key ? 'text-black' : 'text-slate-400'
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {step !== 'ready' && (
        <div className="flex items-center gap-2 mt-4">
          <span className="spinner" aria-hidden="true" />
          <span className="text-sm text-slate-500">
            {step === 'login' ? t.privy.onboardingStep1 : t.privy.onboardingStep2}
          </span>
        </div>
      )}
    </div>
  )
}
