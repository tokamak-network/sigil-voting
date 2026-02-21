'use client'

import { useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {items.map((item, i) => (
        <div
          key={i}
          className="border-2 border-border-light dark:border-border-dark p-6 hover:border-primary transition-colors cursor-pointer group"
          onClick={() => setOpenFaq(openFaq === i ? null : i)}
          aria-expanded={openFaq === i}
          role="button"
        >
          <div className="flex justify-between items-center">
            <h4 className="font-display font-bold uppercase text-base pr-4">{item.q}</h4>
            <span className="material-symbols-outlined text-primary shrink-0 transition-transform duration-200" style={{ transform: openFaq === i ? 'rotate(45deg)' : 'none' }}>add</span>
          </div>
          <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96 mt-2 opacity-100' : 'max-h-0 opacity-0'}`}>
            <p className="text-base opacity-70">{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
