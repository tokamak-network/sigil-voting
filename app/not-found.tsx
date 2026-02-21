'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="w-20 h-20 bg-slate-100 border-2 border-black flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-slate-400">
          search_off
        </span>
      </div>
      <h1 className="text-4xl font-display font-black uppercase tracking-tight">
        404
      </h1>
      <p className="text-lg text-slate-500 font-mono">Page not found</p>
      <Link
        href="/"
        className="bg-black text-white px-6 py-3 font-display font-bold text-sm uppercase tracking-wider hover:bg-slate-800 transition-colors border-2 border-black"
      >
        Back to Home
      </Link>
    </div>
  )
}
