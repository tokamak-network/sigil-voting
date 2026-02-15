/**
 * CreatePollForm - Proposal creation form with voting mode selection
 *
 * Moved poll deployment logic from MACIVotingDemo into a dedicated form.
 * Users can set title, description, duration, and voting mode (D1/D2).
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
  const [votingMode, setVotingMode] = useState<'d1' | 'd2'>('d1')
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
          10, // messageTreeDepth
        ],
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
              localStorage.setItem(`maci-poll-mode-${newPollId}`, votingMode)
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
      setError(err instanceof Error ? err.message : 'Failed to create proposal')
    } finally {
      setIsSubmitting(false)
    }
  }, [address, title, description, durationHours, votingMode, writeContractAsync, publicClient, onPollCreated])

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

      <div className="form-group">
        <label>{t.createPoll.modeLabel}</label>
        <div className="mode-options">
          <button
            className={`mode-option ${votingMode === 'd1' ? 'active' : ''}`}
            onClick={() => setVotingMode('d1')}
            disabled={isSubmitting}
            type="button"
          >
            <strong>{t.createPoll.modeD1}</strong>
            <span>{t.createPoll.modeD1Desc}</span>
          </button>
          <button
            className={`mode-option ${votingMode === 'd2' ? 'active' : ''}`}
            onClick={() => setVotingMode('d2')}
            disabled={isSubmitting}
            type="button"
          >
            <strong>{t.createPoll.modeD2}</strong>
            <span>{t.createPoll.modeD2Desc}</span>
          </button>
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
