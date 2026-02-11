"use client"

interface ScrollProgressProps {
  progress: number
}

export function ScrollProgress({ progress }: ScrollProgressProps) {
  return (
    <div className="relative w-[300px] mx-auto">
      <div className="h-2 rounded-full bg-[#1e1e1e] border border-[#333] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#4ADE50] transition-[width] duration-200 ease-out"
          style={{ width: `${Math.max(8, progress)}%` }}
        />
      </div>
    </div>
  )
}
