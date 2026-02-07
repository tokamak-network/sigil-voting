import type { Proposal } from '../types'
import type { VoteChoice, TokenNote } from '../zkproof'
import { CHOICE_FOR, CHOICE_AGAINST, CHOICE_ABSTAIN } from '../contract'
import { getChoiceLabel } from '../utils'

interface VoteConfirmModalProps {
  proposal: Proposal
  selectedChoice: VoteChoice | null
  tokenNote: TokenNote | null
  onClose: () => void
  onConfirm: () => void
}

export function VoteConfirmModal({
  proposal,
  selectedChoice,
  tokenNote,
  onClose,
  onConfirm,
}: VoteConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Confirm Your Vote</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="confirm-proposal">
            <span className="confirm-label">Proposal</span>
            <span className="confirm-value">{proposal.title}</span>
          </div>
          <div className="confirm-choice">
            <span className="confirm-label">Your Choice</span>
            <span className={`confirm-value choice-${getChoiceLabel(selectedChoice).toLowerCase()}`}>
              {selectedChoice === CHOICE_FOR && '👍 '}
              {selectedChoice === CHOICE_AGAINST && '👎 '}
              {selectedChoice === CHOICE_ABSTAIN && '⏸️ '}
              {getChoiceLabel(selectedChoice)}
            </span>
          </div>
          <div className="confirm-power">
            <span className="confirm-label">Voting Power</span>
            <span className="confirm-value">{tokenNote?.noteValue.toString() || '0'}</span>
          </div>
          <div className="confirm-warning">
            <span className="warning-icon">⚠️</span>
            <div className="warning-text">
              <strong>ZK Proof Generation</strong>
              <p>This process takes 30-60 seconds. Please do not close the browser.</p>
            </div>
          </div>
          <div className="confirm-privacy">
            <span className="privacy-icon">🔐</span>
            <div className="privacy-text">
              <strong>Privacy Protected</strong>
              <p>Your choice is hidden until the reveal phase. No one can see how you voted.</p>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn confirm" onClick={onConfirm}>
            Generate Proof & Vote
          </button>
        </div>
      </div>
    </div>
  )
}
