/**
 * VoteConfirmModal - Vote Confirmation Dialog
 *
 * Shows vote details before submission.
 * Prevents accidental votes.
 */

import { useTranslation } from '../../i18n';

interface VoteConfirmModalProps {
  choice: number;
  weight: number;
  cost: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function VoteConfirmModal({
  choice,
  weight,
  cost,
  onConfirm,
  onCancel,
}: VoteConfirmModalProps) {
  const { t } = useTranslation();

  const choiceLabel = choice === 1 ? t.voteForm.for : t.voteForm.against;

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={t.confirm.title}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{t.confirm.title}</h3>

        <div className="confirm-details">
          <div className="confirm-row">
            <span className="confirm-label">{t.confirm.choice}</span>
            <span className={`confirm-value choice-${choice === 1 ? 'for' : 'against'}`}>
              {choiceLabel}
            </span>
          </div>
          <div className="confirm-row">
            <span className="confirm-label">{t.confirm.weight}</span>
            <span className="confirm-value">{weight}</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-label">{t.confirm.cost}</span>
            <span className="confirm-value">{cost} {t.voteForm.credits}</span>
          </div>
        </div>

        <p className="confirm-notice">{t.confirm.notice}</p>

        <div className="confirm-actions">
          <button onClick={onConfirm} className="brutalist-btn confirm-btn">
            {t.confirm.submit}
          </button>
          <button onClick={onCancel} className="cancel-btn">
            {t.confirm.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
