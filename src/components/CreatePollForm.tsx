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
  MOCK_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
} from '../contractV2'
import { useTranslation } from '../i18n'

const COORD_PUB_KEY_X = 111n
const COORD_PUB_KEY_Y = 222n

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`) => void
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
          COORD_PUB_KEY_X,
          COORD_PUB_KEY_Y,
          MOCK_VERIFIER_ADDRESS as `0x${string}`,
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

              onPollCreated(newPollId, pollAddr)
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
      } else if (msg.includes('NotOwner') || msg.includes('owner')) {
        setError(t.createPoll.errorOwner)
      } else {
        setError(t.createPoll.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [address, title, description, durationHours, writeContractAsync, publicClient, onPollCreated])

  return (
    <div className="create-poll-form">
      <div className="form-group">
        <label>{t.createPoll.titleLabel}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.createPoll.titlePlaceholder}
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <label>{t.createPoll.descLabel}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.createPoll.descPlaceholder}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      <div className="form-group">
        <label>{t.createPoll.durationLabel}</label>
        <div className="duration-input">
          <input
            type="range"
            min="1"
            max="72"
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value))}
            disabled={isSubmitting}
          />
          <span className="duration-value">
            {durationHours} {t.createPoll.durationHours}
          </span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!title.trim() || isSubmitting || isPending}
        className="brutalist-btn submit-poll-btn"
      >
        {isSubmitting ? t.createPoll.submitting : t.createPoll.submit}
      </button>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
