/**
 * TransactionModal - Reusable transaction progress overlay
 *
 * Shows a full-screen spinner with step-by-step progress
 * while a blockchain transaction is being processed.
 */

import { useTranslation } from '../../i18n';

export interface TxStep {
  key: string;
  label: string;
}

interface TransactionModalProps {
  title: string;
  steps: TxStep[];
  currentStep: string;
  subtitle?: string;
}

export function TransactionModal({ title, steps, currentStep, subtitle }: TransactionModalProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);
  const { t } = useTranslation();

  return (
    <div className="tx-progress-modal">
      <div className="tx-progress-spinner" aria-hidden="true">
        <span className="spinner-large" />
      </div>
      <h3>{title}</h3>
      {subtitle && <p className="tx-stage-text">{subtitle}</p>}
      <div className="tx-progress-steps">
        {steps.map((step, i) => {
          const status = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
          return (
            <div key={step.key} className={`tx-step ${status}`}>
              <span className="tx-step-icon">
                {status === 'done' ? '\u2713' : status === 'active' ? '\u25C9' : '\u25CB'}
              </span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
      <p className="tx-patience">{t.voteForm.patience}</p>
    </div>
  );
}
