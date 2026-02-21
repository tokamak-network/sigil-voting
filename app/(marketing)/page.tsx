import type { Metadata } from 'next'
import Link from 'next/link'
import { en } from '../../src/i18n/en'
import { FaqAccordion } from '../../src/components/ui/FaqAccordion'

export const metadata: Metadata = {
  title: 'Your Vote. Your Secret.',
  description:
    'DAO votes are public. Whales dominate. Bribes go unchecked. SIGIL is the governance protocol that fixes all three — with permanent privacy, anti-bribery, and quadratic voting on Ethereum.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'SIGIL — Your Vote. Your Secret.',
    description: 'Private voting for DAOs. Bribe-proof. Whale-resistant. Built on Ethereum by Tokamak Network.',
    url: '/',
  },
}

export default function HomePage() {
  const t = en
  const titleLines = t.landing.title.split('\n')

  const faqItems = [
    { q: t.landing.faq.q1, a: t.landing.faq.a1 },
    { q: t.landing.faq.q2, a: t.landing.faq.a2 },
    { q: t.landing.faq.q3, a: t.landing.faq.a3 },
    { q: t.landing.faq.q4, a: t.landing.faq.a4 },
    { q: t.landing.faq.q5, a: t.landing.faq.a5 },
    { q: t.landing.faq.q6, a: t.landing.faq.a6 },
    { q: t.landing.faq.q7, a: t.landing.faq.a7 },
    { q: t.landing.faq.q8, a: t.landing.faq.a8 },
  ]

  return (
    <main>
      {/* 1. Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden border-b-2 border-border-light dark:border-border-dark">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-primary text-primary font-display text-xs font-bold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                {t.landing.heroStatus.toUpperCase()}_
              </div>
              <h1 className="text-6xl md:text-8xl font-display font-extrabold leading-tight mb-8 uppercase">
                {titleLines[0]}<br />
                <span className="text-primary">{titleLines[1]}</span>
              </h1>
              <p className="text-xl max-w-xl mb-10 text-slate-600 dark:text-slate-400">
                {t.landing.subtitle}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/vote"
                  className="bg-primary text-white font-display text-lg font-extrabold px-8 py-4 border-2 border-black hover:translate-x-1 hover:-translate-y-1 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] uppercase"
                >
                  {t.landing.enterApp}
                </Link>
                <Link
                  href="/technology"
                  className="border-2 border-border-light dark:border-border-dark font-display text-lg font-extrabold px-8 py-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors uppercase"
                >
                  {t.landing.documentation}
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="border-2 border-border-light dark:border-border-dark p-8 bg-white dark:bg-black/40 backdrop-blur-sm relative z-10">
                <div className="flex justify-between items-center mb-6">
                  <span className="font-display text-xs font-bold opacity-50 uppercase">{t.landing.heroVersion}</span>
                </div>
                <div className="space-y-4">
                  <div className="p-4 border-2 border-primary bg-primary/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">verified_user</span>
                      <span className="font-display text-sm font-bold">{t.landing.zeroExposure.title}</span>
                    </div>
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                  </div>
                  <div className="p-4 border-2 border-border-light dark:border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined">hub</span>
                      <span className="font-display text-sm font-bold">{t.landing.maciSecured.title}</span>
                    </div>
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                  </div>
                  <div className="p-4 border-2 border-border-light dark:border-border-dark flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined">token</span>
                      <span className="font-display text-sm font-bold">Ethereum Sepolia</span>
                    </div>
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                  </div>
                </div>
              </div>
              <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary/10 -z-0"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 border-2 border-primary/20 -z-0"></div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Stats Bar */}
      <section className="bg-black text-white py-8 border-b-2 border-border-light dark:border-border-dark">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { count: t.landing.stats.testsCount, label: t.landing.stats.testsLabel },
              { count: t.landing.stats.contractsCount, label: t.landing.stats.contractsLabel },
              { count: t.landing.stats.propertiesCount, label: t.landing.stats.propertiesLabel },
              { count: t.landing.stats.licenseCount, label: t.landing.stats.licenseLabel },
            ].map((stat, i) => (
              <div key={i} className="text-center md:text-left">
                <div className="font-display text-3xl font-extrabold text-primary">{stat.count}</div>
                <div className="font-display text-sm opacity-70 uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Core Features */}
      <section className="py-24 grid-bg" id="features">
        <div className="container mx-auto px-6">
          <div className="mb-16">
            <h2 className="font-display text-4xl font-extrabold mb-4 uppercase">{t.landing.coreFeatures}</h2>
            <div className="w-24 h-2 bg-primary"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-2 border-border-light dark:border-border-dark">
            {[
              { icon: 'visibility_off', title: t.landing.features.privacy.title, desc: t.landing.features.privacy.desc },
              { icon: 'block', title: t.landing.features.coercion.title, desc: t.landing.features.coercion.desc },
              { icon: 'balance', title: t.landing.features.fairness.title, desc: t.landing.features.fairness.desc },
              { icon: 'fact_check', title: t.landing.features.verified.title, desc: t.landing.features.verified.desc },
            ].map((feat, i) => (
              <div key={i} className={`p-8 ${i < 3 ? 'md:border-r-2 border-b-2' : 'lg:border-b-2'} border-border-light dark:border-border-dark hover:bg-primary hover:text-white transition-colors group`}>
                <span className="material-symbols-outlined text-4xl mb-6 text-primary group-hover:text-white">{feat.icon}</span>
                <h3 className="font-display text-xl font-bold mb-4 uppercase">{feat.title}</h3>
                <p className="text-base leading-relaxed opacity-80 group-hover:opacity-100">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How Privacy Is Guaranteed */}
      <section className="py-24 bg-slate-50 dark:bg-zinc-950 border-y-2 border-border-light dark:border-border-dark">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-extrabold uppercase">{t.landing.operationalFlow}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { num: '01', title: t.landing.lifecycle.step1.title, desc: t.landing.lifecycle.step1.desc, icon: 'lock', color: 'text-primary' },
              { num: '02', title: t.landing.lifecycle.step2.title, desc: t.landing.lifecycle.step2.desc, icon: 'shield', color: 'text-emerald-500' },
              { num: '03', title: t.landing.lifecycle.step3.title, desc: t.landing.lifecycle.step3.desc, icon: 'verified', color: 'text-amber-500' },
            ].map((step, i) => (
              <div key={i} className="relative">
                <div className="font-display text-8xl font-black text-slate-200 dark:text-slate-800 absolute -top-12 -left-4 -z-0">{step.num}</div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`material-symbols-outlined text-2xl ${step.color}`}>{step.icon}</span>
                    <h4 className="font-display text-xl font-bold uppercase">{step.title}</h4>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4.5 ~ 11 sections: Same as before — keeping all remaining sections */}
      {/* 4.5. Transparency */}
      <section className="py-16 border-b-2 border-border-light dark:border-border-dark">
        <div className="container mx-auto px-6">
          <h3 className="font-display text-3xl font-extrabold uppercase text-center mb-12">{t.landing.transparency.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-2 border-border-light dark:border-border-dark max-w-4xl mx-auto">
            <div className="p-8 border-b-2 md:border-b-0 md:border-r-2 border-border-light dark:border-border-dark">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-emerald-500">visibility</span>
                <h4 className="font-display font-bold uppercase">{t.landing.transparency.visibleTitle}</h4>
              </div>
              <ul className="space-y-4">
                {[t.landing.transparency.visible1, t.landing.transparency.visible2, t.landing.transparency.visible3].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-emerald-500 text-sm mt-1">check_circle</span>
                    <span className="text-slate-600 dark:text-slate-400">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-red-500">visibility_off</span>
                <h4 className="font-display font-bold uppercase">{t.landing.transparency.hiddenTitle}</h4>
              </div>
              <ul className="space-y-4">
                {[t.landing.transparency.hidden1, t.landing.transparency.hidden2, t.landing.transparency.hidden3].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-500 text-sm mt-1">cancel</span>
                    <span className="text-slate-600 dark:text-slate-400">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="max-w-4xl mx-auto mt-8 p-6 border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-500 mt-0.5">info</span>
              <div>
                <h4 className="font-display font-bold text-sm uppercase mb-2">{t.landing.transparency.coordinatorTitle}</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{t.landing.transparency.coordinatorNote}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4.7. Operational Advantages */}
      <section className="py-24 grid-bg">
        <div className="container mx-auto px-6">
          <div className="mb-16">
            <h2 className="font-display text-4xl font-extrabold mb-4 uppercase">{t.landing.advantages.title}</h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">{t.landing.advantages.subtitle}</p>
            <div className="w-24 h-2 bg-primary mt-4"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-2 border-border-light dark:border-border-dark">
            {[
              { icon: 'token', ...t.landing.advantages.erc20 },
              { icon: 'cloud_off', ...t.landing.advantages.serverless },
              { icon: 'speed', ...t.landing.advantages.l2 },
              { icon: 'groups', ...t.landing.advantages.tokenGate },
              { icon: 'code', ...t.landing.advantages.widget },
              { icon: 'smart_toy', ...t.landing.advantages.autoTally },
            ].map((item, i) => (
              <div key={i} className={`p-8 border-border-light dark:border-border-dark hover:bg-primary hover:text-white transition-colors group ${i < 3 ? 'border-b-2' : ''} ${(i + 1) % 3 !== 0 ? 'lg:border-r-2' : ''} ${i % 2 === 0 && i < 4 ? 'md:border-r-2 lg:border-r-0' : ''}`}>
                <span className="material-symbols-outlined text-3xl mb-4 text-primary group-hover:text-white">{item.icon}</span>
                <h3 className="font-display text-lg font-bold mb-2 uppercase">{item.title}</h3>
                <p className="text-sm leading-relaxed opacity-80 group-hover:opacity-100">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Ecosystem Comparison */}
      <section className="py-24" id="comparison">
        <div className="container mx-auto px-6">
          <div className="mb-12">
            <h2 className="font-display text-4xl font-extrabold uppercase">{t.landing.comparison.title}</h2>
            <p className="font-display text-base opacity-70 mt-2">{t.landing.comparison.subtitle}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border-2 border-border-light dark:border-border-dark font-display text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-900 border-b-2 border-border-light dark:border-border-dark">
                  <th className="p-6 text-left">{t.landing.comparison.feature}</th>
                  <th className="p-6 text-center border-l-2 border-border-light dark:border-border-dark bg-primary text-white">SIGIL</th>
                  <th className="p-6 text-center border-l-2 border-border-light dark:border-border-dark">Snapshot</th>
                  <th className="p-6 text-center border-l-2 border-border-light dark:border-border-dark">Aragon</th>
                  <th className="p-6 text-center border-l-2 border-border-light dark:border-border-dark">Tally</th>
                  <th className="p-6 text-center border-l-2 border-border-light dark:border-border-dark">Vocdoni</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { feature: t.landing.comparison.permanentPrivacy, values: [t.landing.comparison.yes, t.landing.comparison.postReveal, t.landing.comparison.yes, t.landing.comparison.no, t.landing.comparison.partial], icons: ['check_circle', 'error', 'check_circle', 'cancel', 'error'], colors: ['text-emerald-500', 'text-amber-500', 'text-emerald-500', 'text-red-500', 'text-amber-500'] },
                  { feature: t.landing.comparison.antiBribery, values: [t.landing.comparison.yes, t.landing.comparison.no, t.landing.comparison.demoStage, t.landing.comparison.no, t.landing.comparison.no], icons: ['check_circle', 'cancel', 'error', 'cancel', 'cancel'], colors: ['text-emerald-500', 'text-red-500', 'text-amber-500', 'text-red-500', 'text-red-500'] },
                  { feature: t.landing.comparison.quadraticVoting, values: [t.landing.comparison.yes, t.landing.comparison.plugin, t.landing.comparison.no, t.landing.comparison.no, t.landing.comparison.no], icons: ['check_circle', 'error', 'cancel', 'cancel', 'cancel'], colors: ['text-emerald-500', 'text-amber-500', 'text-red-500', 'text-red-500', 'text-red-500'] },
                  { feature: t.landing.comparison.onChainVerify, values: [t.landing.comparison.yes, t.landing.comparison.offchain, t.landing.comparison.yes, t.landing.comparison.yes, t.landing.comparison.ownChain], icons: ['check_circle', 'error', 'check_circle', 'check_circle', 'error'], colors: ['text-emerald-500', 'text-amber-500', 'text-emerald-500', 'text-emerald-500', 'text-amber-500'] },
                  { feature: t.landing.comparison.automation, values: [t.landing.comparison.yes, t.landing.comparison.yes, t.landing.comparison.demoStage, t.landing.comparison.yes, t.landing.comparison.yes], icons: ['check_circle', 'check_circle', 'error', 'check_circle', 'check_circle'], colors: ['text-emerald-500', 'text-emerald-500', 'text-amber-500', 'text-emerald-500', 'text-emerald-500'] },
                  { feature: t.landing.comparison.erc20Support, values: [t.landing.comparison.native, t.landing.comparison.offchain, t.landing.comparison.yes, t.landing.comparison.yes, t.landing.comparison.offchain], icons: ['check_circle', 'error', 'check_circle', 'check_circle', 'error'], colors: ['text-emerald-500', 'text-amber-500', 'text-emerald-500', 'text-emerald-500', 'text-amber-500'] },
                  { feature: t.landing.comparison.serverlessTally, values: [t.landing.comparison.free, t.landing.comparison.selfHosted, t.landing.comparison.selfHosted, t.landing.comparison.selfHosted, t.landing.comparison.selfHosted], icons: ['check_circle', 'error', 'error', 'error', 'error'], colors: ['text-emerald-500', 'text-amber-500', 'text-amber-500', 'text-amber-500', 'text-amber-500'] },
                ] as const).map((row, i) => (
                  <tr key={i} className="border-b-2 border-border-light dark:border-border-dark last:border-b-0">
                    <td className="p-4 font-bold">{row.feature}</td>
                    {row.values.map((val, j) => (
                      <td key={j} className={`p-4 text-center border-l-2 border-border-light dark:border-border-dark ${j === 0 ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
                        <span className={`material-symbols-outlined text-2xl ${row.colors[j]}`}>{row.icons[j]}</span>
                        <div className="text-xs mt-1 opacity-60">{val}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Try It Now */}
      <section className="py-24 bg-black text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="font-display text-4xl font-extrabold uppercase mb-4">{t.landing.demo.title}</h2>
            <p className="opacity-60">{t.landing.demo.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-white/20 max-w-4xl mx-auto">
            {[
              { num: '01', icon: 'lock', title: t.landing.cta.step1, desc: t.landing.demo.stepSubmit },
              { num: '02', icon: 'verified', title: t.landing.cta.step2, desc: t.landing.demo.stepProof },
              { num: '03', icon: 'how_to_vote', title: t.landing.cta.step3, desc: t.landing.demo.stepResult },
            ].map((step, i) => (
              <div key={i} className={`p-8 ${i < 2 ? 'md:border-r-2 border-b-2 md:border-b-0' : ''} border-white/20`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-display text-xs font-bold text-primary">{step.num}</span>
                  <span className="material-symbols-outlined text-primary">{step.icon}</span>
                </div>
                <h4 className="font-display font-bold uppercase mb-2">{step.title}</h4>
                <p className="text-sm text-white/60 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="max-w-4xl mx-auto mt-8 text-center">
            <Link href="/vote" className="inline-block bg-primary text-white font-display text-lg font-extrabold px-12 py-5 border-2 border-white hover:bg-white hover:text-black transition-all uppercase">
              {t.landing.demo.comingSoon}
            </Link>
            <p className="font-display text-xs text-white/40 mt-4 uppercase tracking-widest">{t.landing.demo.network}</p>
          </div>
        </div>
      </section>

      {/* 7. Developer SDK */}
      <section className="py-24 grid-bg" id="sdk">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="font-display text-4xl font-extrabold mb-8 uppercase">{t.landing.sdkIntegration}</h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">{t.landing.integration.subtitle}</p>
              <div className="space-y-6">
                {[
                  { icon: 'code', text: t.landing.integration.trust1 },
                  { icon: 'layers', text: t.landing.integration.trust2 },
                  { icon: 'security', text: t.landing.integration.trust3 },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                    <div>
                      <h4 className="font-display font-bold">{item.text.split(' — ')[0]}</h4>
                      <p className="text-base opacity-80">{item.text.split(' — ')[1]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-2 border-border-light dark:border-border-dark bg-slate-900 text-slate-100 p-1">
              <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b-2 border-border-light dark:border-border-dark">
                <span className="font-display text-xs font-bold text-slate-400">bash — terminal</span>
                <div className="flex gap-2"><div className="w-3 h-3 bg-slate-700"></div><div className="w-3 h-3 bg-slate-700"></div></div>
              </div>
              <div className="p-6 font-display text-sm leading-relaxed">
                <div className="flex gap-4 mb-4"><span className="text-slate-500">$</span><span className="text-emerald-400">{t.landing.integration.step1Code}</span></div>
                <div className="text-slate-400 mb-2">{'// Initialize Sigil Client'}</div>
                <div><span className="text-blue-400">const</span> sigil = <span className="text-blue-400">new</span> <span className="text-yellow-400">SigilClient</span>{'({'}<br />{'  '}maciAddress: <span className="text-orange-400">{`'0x...'`}</span>,<br />{'  '}provider: <span className="text-blue-400">yourProvider</span><br />{'});'}</div>
                <div className="mt-4"><span className="text-blue-400">await</span> sigil.<span className="text-yellow-400">signUp</span>();<br /><span className="text-blue-400">await</span> sigil.<span className="text-yellow-400">vote</span>(pollId, <span className="text-orange-400">{`'for'`}</span>, 3);</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="py-24 border-t-2 border-border-light dark:border-border-dark" id="faq">
        <div className="container mx-auto px-6">
          <h2 className="font-display text-4xl font-extrabold mb-12 uppercase text-center">{t.landing.faq.title}</h2>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* 9. Deployed Contracts */}
      <section className="py-16 border-b-2 border-border-light dark:border-border-dark">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-extrabold uppercase mb-2">{t.landing.contracts.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t.landing.contracts.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-border-light dark:border-border-dark max-w-4xl mx-auto">
            {([
              { label: t.landing.contracts.maci, addr: '0x26428484F192D1dA677111A47615378Bc889d441' },
              { label: t.landing.contracts.accQueue, addr: '0x5321607ABc8171397Fac7c77FbB567847AF4d2ff' },
              { label: t.landing.contracts.token, addr: '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044' },
            ]).map((c, i) => (
              <div key={i} className={`p-6 ${i < 2 ? 'md:border-r-2 border-b-2 md:border-b-0' : ''} border-border-light dark:border-border-dark`}>
                <p className="font-display text-xs font-bold uppercase tracking-widest text-primary mb-2">{c.label}</p>
                <p className="font-mono text-xs break-all opacity-60 mb-3">{c.addr}</p>
                <a href={`https://sepolia.etherscan.io/address/${c.addr}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-display font-bold text-primary hover:underline uppercase">
                  {t.landing.contracts.viewOn}<span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. Roadmap */}
      <section className="py-24 grid-bg">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-extrabold uppercase mb-4">{t.landing.roadmap.title}</h2>
            <p className="text-slate-600 dark:text-slate-400">{t.landing.roadmap.subtitle}</p>
            <div className="w-24 h-2 bg-primary mx-auto mt-4"></div>
          </div>
          <div className="max-w-3xl mx-auto space-y-0">
            {([t.landing.roadmap.phase1, t.landing.roadmap.phase2, t.landing.roadmap.phase3, t.landing.roadmap.phase4, t.landing.roadmap.phase5, t.landing.roadmap.phase6]).map((phase, i) => {
              const isComplete = phase.status === 'Complete' || phase.status === '완료'
              const isActive = phase.status === 'In Progress' || phase.status === '진행 중'
              return (
                <div key={i} className="flex items-start gap-6">
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 ${isComplete ? 'bg-primary border-primary' : isActive ? 'border-primary' : 'border-slate-300 dark:border-slate-600'}`}>
                      {isComplete && <span className="material-symbols-outlined text-white text-sm">check</span>}
                      {isActive && <span className="w-2 h-2 bg-primary animate-pulse"></span>}
                    </div>
                    {i < 5 && <div className={`w-0.5 h-12 ${isComplete ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                  </div>
                  <div className="pb-6">
                    <h4 className={`font-display font-bold uppercase text-sm ${isComplete ? 'text-primary' : isActive ? '' : 'opacity-50'}`}>{phase.title}</h4>
                    <span className={`font-display text-xs uppercase tracking-widest ${isComplete ? 'text-primary' : isActive ? 'text-amber-500' : 'text-slate-400'}`}>{phase.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 11. CTA */}
      <section className="py-24 bg-primary text-white border-y-2 border-black">
        <div className="container mx-auto px-6 text-center">
          <h2 className="font-display text-5xl md:text-7xl font-black mb-8 uppercase leading-tight">{t.landing.cta.title}</h2>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/vote" className="bg-black text-white font-display text-xl font-extrabold px-12 py-6 border-2 border-white hover:bg-white hover:text-black transition-all uppercase">{t.landing.cta.button}</Link>
            <a href="mailto:monica@tokamak.network" className="bg-transparent text-white font-display text-xl font-extrabold px-12 py-6 border-2 border-white hover:bg-white hover:text-black transition-all uppercase">{t.landing.contactSales}</a>
          </div>
        </div>
      </section>
    </main>
  )
}
