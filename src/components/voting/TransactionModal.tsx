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
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-8">
      <div className="w-12 h-12 border-4 border-black border-t-primary animate-spin" aria-hidden="true" />
      <h3 className="font-display text-2xl font-black uppercase tracking-tight">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      <div className="w-full space-y-3">
        {steps.map((step, i) => {
          const status = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
          return (
            <div key={step.key} className={`flex items-center gap-3 p-3 border-2 ${
              status === 'done' ? 'border-green-500 bg-green-50' :
              status === 'active' ? 'border-primary bg-primary/5' :
              'border-slate-200 bg-white'
            }`}>
              <span className={`material-symbols-outlined text-lg ${
                status === 'done' ? 'text-green-600' :
                status === 'active' ? 'text-primary' :
                'text-slate-300'
              }`}>
                {status === 'done' ? 'check_circle' : status === 'active' ? 'pending' : 'circle'}
              </span>
              <span className={`text-sm font-bold ${status === 'pending' ? 'text-slate-400' : 'text-black'}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 uppercase tracking-widest">{t.voteForm.patience}</p>
    </div>
  );
}
