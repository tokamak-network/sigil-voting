/**
 * CreatePollForm - Simple proposal creation form
 *
 * Only title, description (optional), and duration.
 * Voting mode is always quadratic (D2) — voters choose their own weight.
 */

import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MSG_PROCESSOR_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { useTranslation } from '../i18n'

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`, title?: string) => void
}

export function CreatePollForm({ onPollCreated }: CreatePollFormProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const { t } = useTranslation()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (!address || !title.trim()) return
    setIsSubmitting(true)
    setError(null)

    try {
      const durationSeconds = BigInt(durationHours * 3600)

      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'deployPoll',
        args: [
          title.trim(),
          durationSeconds,
          DEFAULT_COORD_PUB_KEY_X,
          DEFAULT_COORD_PUB_KEY_Y,
          MSG_PROCESSOR_VERIFIER_ADDRESS as `0x${string}`,
          VK_REGISTRY_ADDRESS as `0x${string}`,
          2, // messageTreeDepth (dev: 2, production: 10)
        ],
        gas: 15000000n, // bypass RPC estimation cap (publicnode caps at 16.7M)
      })

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        for (const log of receipt.logs) {
          if (log.topics.length >= 2) {
            const newPollId = parseInt(log.topics[1] as string, 16)
            if (log.data && log.data.length >= 66) {
              const pollAddr = ('0x' + log.data.slice(26, 66)) as `0x${string}`

              localStorage.setItem('maci-last-poll-id', newPollId.toString())
              localStorage.setItem('maci-last-poll-addr', pollAddr)
              localStorage.setItem(`maci-poll-title-${newPollId}`, title.trim())
              if (description.trim()) {
                localStorage.setItem(`maci-poll-desc-${newPollId}`, description.trim())
              }

              onPollCreated(newPollId, pollAddr, title.trim())
            }
            break
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setError(t.voteForm.errorGas)
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected)
      } else if (msg.includes('InsufficientTokens') || msg.includes('NotOwner') || msg.includes('owner')) {
        setError(t.createPoll.errorOwner)
      } else {
        setError(t.createPoll.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [address, title, description, durationHours, writeContractAsync, publicClient, onPollCreated])

  const titleLen = title.trim().length
  const descLen = description.length
  const titleValid = titleLen >= 3 && titleLen <= 200
  const descValid = descLen <= 1000

  return (
    <div className="create-poll-form">
      <div className="form-group">
        <label htmlFor="poll-title">{t.createPoll.titleLabel}</label>
        <input
          id="poll-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.createPoll.titlePlaceholder}
          disabled={isSubmitting}
          maxLength={200}
          aria-describedby="title-counter"
          aria-invalid={titleLen > 0 && !titleValid}
        />
        <span id="title-counter" className={`char-counter ${titleLen > 0 && !titleValid ? 'invalid' : ''}`}>
          {titleLen}/200
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="poll-desc">{t.createPoll.descLabel}</label>
        <textarea
          id="poll-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.createPoll.descPlaceholder}
          disabled={isSubmitting}
          rows={3}
          maxLength={1000}
          aria-describedby="desc-counter"
        />
        <span id="desc-counter" className={`char-counter ${!descValid ? 'invalid' : ''}`}>
          {descLen}/1000
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="poll-duration">{t.createPoll.durationLabel}</label>
        <div className="duration-input">
          <input
            id="poll-duration"
            type="range"
            min="1"
            max="72"
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value))}
            disabled={isSubmitting}
            aria-valuetext={`${durationHours} ${t.createPoll.durationHours}`}
          />
          <span className="duration-value">
            {durationHours} {t.createPoll.durationHours}
          </span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!titleValid || !descValid || isSubmitting || isPending}
        className="brutalist-btn submit-poll-btn"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? t.createPoll.submitting : t.createPoll.submit}
      </button>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </div>
  )
}
