import type { Page } from '../types'
import { ProposalsCarousel } from './ProposalsCarousel'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
  navigateToProposal: (proposalId: number) => void
}

export function LandingPage({ setCurrentPage, navigateToProposal }: LandingPageProps) {
  return (
    <div className="brutalist-landing">
      {/* Hero Section */}
      <section className="brutalist-hero">
        <div className="brutalist-hero-content">
          <div className="brutalist-hero-left">
            <div className="brutalist-badge">
              Powered by Zero-Knowledge Proofs
            </div>
            <h1 className="brutalist-title">
              Your Vote.<br />Your Secret.
            </h1>
            <p className="brutalist-subtitle">
              No one sees your choice. No one can force you. Math guarantees it.
            </p>
            <div className="brutalist-cta-group">
              <button className="brutalist-btn-primary" onClick={() => setCurrentPage('proposals')}>
                Enter App <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
          <div className="brutalist-hero-right">
            <div className="brutalist-hero-bg-lines">
              <div className="bg-line"></div>
              <div className="bg-line"></div>
              <div className="bg-line"></div>
            </div>
            <div className="brutalist-hero-text">
              ZK<br />VOTE
            </div>
            <div className="brutalist-hero-version">
              <span className="version-year">2026</span>
              <span className="version-label">D1+D2 Integrated</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="brutalist-features">
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">shield_person</span>
          <div>
            <h3>True Privacy</h3>
            <p>Zero exposure.</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">lock_open_right</span>
          <div>
            <h3>No Coercion</h3>
            <p>Anti-bribery tech.</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">balance</span>
          <div>
            <h3>Fair Influence</h3>
            <p>Quadratic scaling.</p>
          </div>
        </div>
        <div className="brutalist-feature-card">
          <span className="material-symbols-outlined">functions</span>
          <div>
            <h3>Verified by Math</h3>
            <p>Audit on-chain.</p>
          </div>
        </div>
      </section>

      {/* Voting Lifecycle Section */}
      <section className="brutalist-lifecycle" id="how-it-works">
        <div className="brutalist-section-header">
          <h2>The Voting Lifecycle</h2>
          <span className="brutalist-label">Commit-Reveal Flow</span>
        </div>
        <div className="brutalist-steps">
          <div className="brutalist-step">
            <span className="step-bg-number">1</span>
            <h3>
              <span className="step-number">1</span>
              Commit
            </h3>
            <p>Encrypt your vote choice and generate a ZK proof. Your selection is fully encrypted before being recorded on the blockchain.</p>
          </div>
          <div className="brutalist-step">
            <span className="step-bg-number">2</span>
            <h3>
              <span className="step-number">2</span>
              Reveal
            </h3>
            <p>Reveal your vote after the commit period ends. Unrevealed votes are excluded from the final tally.</p>
          </div>
          <div className="brutalist-step">
            <span className="step-bg-number">3</span>
            <h3>
              <span className="step-number">3</span>
              Result
            </h3>
            <p>Once all votes are revealed, quadratic weighting is applied and final results are cryptographically verified.</p>
          </div>
        </div>
      </section>

      {/* Quadratic Voting Section */}
      <section className="brutalist-qv" id="qv">
        <div className="brutalist-qv-left">
          <h2>Plutocracy vs. Fairness</h2>
          <p>Comparing Regular (Plutocratic) voting with Quadratic weighting. We ensure that a 100x wealth advantage only results in a 10x power advantage.</p>
        </div>
        <div className="brutalist-qv-right">
          <table className="brutalist-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Regular Voting</th>
                <th className="highlight">Quadratic Voting</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label">Token Cost</td>
                <td>100 Tokens</td>
                <td>100 Tokens</td>
              </tr>
              <tr>
                <td className="label">Voting Power</td>
                <td className="bad">100 Votes</td>
                <td className="good">10 Votes</td>
              </tr>
              <tr className="total-row">
                <td className="label">Total Strength</td>
                <td>100x Strength</td>
                <td className="good bold">10x Strength</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Proposals Carousel */}
      <ProposalsCarousel onProposalClick={navigateToProposal} />

      {/* CTA Section */}
      <section className="brutalist-cta">
        <h2>Ready to Vote Privately?</h2>
        <button
          className="brutalist-cta-button"
          onClick={() => setCurrentPage('proposals')}
        >
          Try it on Sepolia Testnet
        </button>
        <div className="brutalist-cta-steps">
          <span>Connect Wallet <span className="material-symbols-outlined">arrow_forward</span></span>
          <span>Pick a Proposal <span className="material-symbols-outlined">arrow_forward</span></span>
          <span className="highlight">Vote</span>
        </div>
      </section>
    </div>
  )
}
