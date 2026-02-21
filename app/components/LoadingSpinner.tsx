export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="material-symbols-outlined text-4xl animate-spin text-primary">
        progress_activity
      </span>
    </div>
  )
}
