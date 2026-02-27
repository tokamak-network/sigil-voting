'use client'

import { useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from '../i18n'

interface InviteSharePanelProps {
  pollId: number
  pollTitle?: string
}

export function InviteSharePanel({ pollId, pollTitle }: InviteSharePanelProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/vote/${pollId}?invite=true`
    : `/vote/${pollId}?invite=true`

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = inviteUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [inviteUrl])

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: pollTitle || t.invite.shareTitle,
          text: t.invite.noWalletNeeded,
          url: inviteUrl,
        })
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy()
    }
  }, [inviteUrl, pollTitle, t, handleCopy])

  return (
    <div className="border-2 border-black p-6 bg-white">
      <h3 className="font-display font-bold text-lg uppercase mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">share</span>
        {t.invite.title}
      </h3>

      <p className="text-sm text-slate-500 mb-4">{t.invite.noWalletNeeded}</p>

      {/* URL + Copy */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          readOnly
          value={inviteUrl}
          className="flex-1 border-2 border-slate-200 px-3 py-2 text-xs font-mono bg-slate-50 truncate"
        />
        <button
          onClick={handleCopy}
          className={`px-4 py-2 text-xs font-bold border-2 transition-colors ${
            copied
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-black text-white border-black hover:bg-slate-800'
          }`}
        >
          {copied ? t.invite.copied : t.invite.copyLink}
        </button>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3 p-4 border border-slate-200 bg-slate-50">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.invite.qrTitle}</p>
        <QRCodeSVG value={inviteUrl} size={160} level="M" />
      </div>

      {/* Web Share API (mobile) */}
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          onClick={handleShare}
          className="w-full mt-4 py-3 bg-primary text-white font-display font-bold uppercase text-sm border-2 border-black hover:translate-x-1 hover:-translate-y-1 transition-transform flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">send</span>
          {t.invite.shareButton}
        </button>
      )}
    </div>
  )
}
