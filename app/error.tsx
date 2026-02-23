'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-8">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-display font-black uppercase mb-4">
          Something went wrong
        </h2>
        <p className="text-slate-600 mb-6">
          An unexpected error occurred. Please try again.
        </p>
        {process.env.NODE_ENV === 'development' && error?.message && (
          <pre className="text-xs text-left bg-slate-100 p-4 mb-6 overflow-auto max-h-40 border border-slate-200">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-6 py-3 bg-black text-white font-bold uppercase text-sm tracking-widest border-2 border-black hover:bg-slate-800 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
