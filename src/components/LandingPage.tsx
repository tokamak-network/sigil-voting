import type { Page } from '../types'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  return (
    <div className="landing-page">
      <section className="hero-section-new">
        <div className="hero-badge-new">D1 Private Voting Spec</div>
        <h1 className="hero-title-new">Commit-Reveal ZK Voting</h1>
        <p className="hero-subtitle-new">
          Zero-knowledge proofs for hidden ballot choices. Prevent vote buying and coercion while maintaining verifiable voting power.
        </p>

        <div className="stats-bar">
          <div className="stat-item-new">
            <span className="stat-number">~150K</span>
            <span className="stat-label-new">Circuit Constraints</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item-new">
            <span className="stat-number">20</span>
            <span className="stat-label-new">Merkle Depth</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item-new">
            <span className="stat-number">6</span>
            <span className="stat-label-new">Verification Stages</span>
          </div>
        </div>

        <div className="hero-cta-new">
          <button className="cta-primary-new" onClick={() => setCurrentPage('proposals')}>
            Try Demo
          </button>
          <a href="https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md" target="_blank" rel="noopener noreferrer" className="cta-secondary-new">
            View Spec
          </a>
        </div>
      </section>

      <section id="security" className="security-section">
        <h2>Security Properties</h2>
        <p className="section-subtitle">From the D1 specification</p>

        <div className="security-grid">
          <div className="security-card">
            <div className="security-icon">🔒</div>
            <h3>Ballot Privacy</h3>
            <p>Choice hidden until reveal phase; observers cannot determine individual votes.</p>
            <div className="security-tech">Commit-Reveal</div>
          </div>
          <div className="security-card">
            <div className="security-icon">🛡️</div>
            <h3>Anti-Coercion</h3>
            <p>Voters cannot prove their selection to potential bribers.</p>
            <div className="security-tech">ZK Proof</div>
          </div>
          <div className="security-card">
            <div className="security-icon">🚫</div>
            <h3>Double-Spend Prevention</h3>
            <p>Nullifier derived from hash(sk, proposalId) prevents reuse.</p>
            <div className="security-tech">Nullifier System</div>
          </div>
          <div className="security-card">
            <div className="security-icon">📊</div>
            <h3>Verifiable Voting Power</h3>
            <p>Token ownership proven via merkle proof without revealing identity.</p>
            <div className="security-tech">Snapshot Merkle Tree</div>
          </div>
          <div className="security-card">
            <div className="security-icon">🔐</div>
            <h3>Ownership Proof</h3>
            <p>Secret key derives public key, proving note ownership.</p>
            <div className="security-tech">Baby Jubjub</div>
          </div>
          <div className="security-card">
            <div className="security-icon">✅</div>
            <h3>On-Chain Verification</h3>
            <p>Groth16 proofs verified by smart contract.</p>
            <div className="security-tech">Groth16 Verifier</div>
          </div>
        </div>
      </section>

      <section className="how-section">
        <h2>6 Verification Stages</h2>
        <div className="stages-grid">
          <div className="stage-card">
            <div className="stage-number">1</div>
            <h3>Token Verification</h3>
            <p>Reconstruct note hash from key and value</p>
            <code>noteHash = hash(pkX, pkY, value, salt)</code>
          </div>
          <div className="stage-card">
            <div className="stage-number">2</div>
            <h3>Snapshot Inclusion</h3>
            <p>Validate token existence via merkle proof</p>
            <code>verify(noteHash, merklePath, root)</code>
          </div>
          <div className="stage-card">
            <div className="stage-number">3</div>
            <h3>Ownership Proof</h3>
            <p>Confirm secret key derives public key</p>
            <code>pk = derive(sk)</code>
          </div>
          <div className="stage-card">
            <div className="stage-number">4</div>
            <h3>Power Consistency</h3>
            <p>Ensure declared power matches note value</p>
            <code>votingPower === noteValue</code>
          </div>
          <div className="stage-card">
            <div className="stage-number">5</div>
            <h3>Choice Validation</h3>
            <p>Restrict vote to valid options</p>
            <code>choice in [0, 1, 2]</code>
          </div>
          <div className="stage-card">
            <div className="stage-number">6</div>
            <h3>Commitment Creation</h3>
            <p>Generate binding hash including proposal ID</p>
            <code>commit = hash(choice, salt, id)</code>
          </div>
        </div>
      </section>

      <section className="compare-section">
        <h2>Commit-Reveal Flow</h2>
        <div className="flow-diagram">
          <div className="flow-phase">
            <h3>Phase 1: Commit</h3>
            <ul>
              <li>Generate ZK proof of token ownership</li>
              <li>Submit voteCommitment on-chain</li>
              <li>Nullifier prevents double voting</li>
              <li>Choice remains hidden</li>
            </ul>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-phase">
            <h3>Phase 2: Reveal</h3>
            <ul>
              <li>Submit choice and voteSalt</li>
              <li>Contract verifies commitment</li>
              <li>Vote counted in tally</li>
              <li>Time-locked to prevent manipulation</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="cta-section-new">
        <h2>Try the Demo</h2>
        <p>Experience ZK commit-reveal voting with the D1 specification.</p>
        <button className="cta-primary-new large" onClick={() => setCurrentPage('proposals')}>
          Launch Demo
        </button>
        <span className="network-note">Demo mode - Contract not yet deployed</span>
      </section>
    </div>
  )
}
