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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="bg-white border-4 border-black p-8 max-w-md w-full" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl font-black uppercase tracking-tight mb-6">{t.confirm.title}</h3>
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center p-3 border-2 border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase">{t.confirm.choice}</span>
            <span className={`font-display font-black text-lg uppercase ${choice === 1 ? 'text-emerald-500' : 'text-red-500'}`}>{choiceLabel}</span>
          </div>
          <div className="flex justify-between items-center p-3 border-2 border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase">{t.confirm.weight}</span>
            <span className="font-mono font-bold text-lg">{weight}</span>
          </div>
          <div className="flex justify-between items-center p-3 border-2 border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase">{t.confirm.cost}</span>
            <span className="font-mono font-bold text-lg text-primary">{cost} {t.voteForm.credits}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">{t.confirm.notice}</p>
        <div className="flex flex-col gap-3">
          <button onClick={onConfirm} className="w-full bg-primary text-white py-4 font-display font-black uppercase text-lg border-2 border-black hover:bg-blue-600 transition-colors" style={{ boxShadow: '4px 4px 0px 0px rgba(0, 82, 255, 1)' }}>
            {t.confirm.submit}
          </button>
          <button onClick={onCancel} className="w-full bg-white text-black py-3 font-bold uppercase text-sm border-2 border-black hover:bg-slate-50 transition-colors">
            {t.confirm.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
