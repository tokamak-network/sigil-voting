'use client'

import { useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openRow, setOpenRow] = useState<number | null>(null)
  const rows: Array<[FaqItem, FaqItem | null]> = []
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i], items[i + 1] ?? null])
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {rows.map((row, rowIndex) => {
        const isOpen = openRow === rowIndex
        return (
          <div key={rowIndex} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {row.map((item, colIndex) => {
              if (!item) {
                return <div key={`empty-${rowIndex}-${colIndex}`} className="hidden md:block" />
              }
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className="border-2 border-border-light dark:border-border-dark p-6 hover:border-primary transition-colors cursor-pointer group"
                  onClick={() => setOpenRow(isOpen ? null : rowIndex)}
                  aria-expanded={isOpen}
                  role="button"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-display font-bold uppercase text-base pr-4">{item.q}</h4>
                    <span className="material-symbols-outlined text-primary shrink-0 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}>add</span>
                  </div>
                  {isOpen && (
                    <div className="mt-2">
                      <p className="text-base opacity-70">{item.a}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
