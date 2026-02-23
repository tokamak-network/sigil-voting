'use client'

interface FaqItem {
  q: string
  a: string
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const rows: Array<[FaqItem, FaqItem | null]> = []
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i], items[i + 1] ?? null])
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {rows.map((row, rowIndex) => (
        <details key={rowIndex} className="group">
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {row.map((item, colIndex) => {
                if (!item) {
                  return <div key={`empty-${rowIndex}-${colIndex}`} className="hidden md:block" />
                }
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className="border-2 border-border-light dark:border-border-dark p-6 bg-white dark:bg-white hover:border-primary transition-colors select-none"
                  >
                    <div className="flex justify-between items-center">
                      <h4 className="font-display font-bold uppercase text-base pr-4 text-slate-900">{item.q}</h4>
                      <span className="material-symbols-outlined text-primary shrink-0 transition-transform duration-200 group-open:rotate-45">
                        add
                      </span>
                    </div>
                    <div className="mt-3 hidden group-open:block">
                      <p className="text-base text-slate-700">{item.a}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </summary>
        </details>
      ))}
    </div>
  )
}
