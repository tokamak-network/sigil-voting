'use client'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="text-center max-w-md">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
          error_outline
        </span>
        <h2 className="text-xl font-display font-black uppercase mb-4">
          Voting Error
        </h2>
        <p className="text-slate-600 mb-6">
          Something went wrong while processing your request.
          Your vote data is safe.
        </p>
        {process.env.NODE_ENV === 'development' && error?.message && (
          <pre className="text-xs text-left bg-slate-100 p-4 mb-6 overflow-auto max-h-40 border border-slate-200">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-6 py-3 bg-primary text-white font-bold uppercase text-sm tracking-widest border-2 border-black hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
