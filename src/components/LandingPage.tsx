import type { Page } from '../types'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section-new">
        <div className="hero-badge-new">Powered by Zero-Knowledge Proofs</div>
        <h1 className="hero-title-new">
          투표는 비밀이어야 합니다
        </h1>
        <p className="hero-subtitle-new">
          누구도 당신의 선택을 볼 수 없습니다. 수학이 보장합니다.
        </p>

        <div className="hero-cta-new">
          <button className="cta-primary-new" onClick={() => setCurrentPage('proposals')}>
            투표 참여하기
          </button>
          <a href="https://github.com/tokamak-network/zk-dex-d1-private-voting" target="_blank" rel="noopener noreferrer" className="cta-secondary-new">
            GitHub
          </a>
        </div>
      </section>

      {/* Problem Section */}
      <section className="problem-section">
        <h2>일반 투표의 문제점</h2>
        <div className="problem-grid">
          <div className="problem-card">
            <div className="problem-icon">👁️</div>
            <h3>투표 내용 노출</h3>
            <p>블록체인에 모든 투표가 공개되어 누가 어떻게 투표했는지 추적 가능</p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">🐋</div>
            <h3>고래의 지배</h3>
            <p>자금이 많은 사람이 무제한으로 영향력을 행사</p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">😰</div>
            <h3>압박과 강요</h3>
            <p>투표 내용이 보이면 외부 압력에 취약</p>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="solution-section">
        <h2>ZK Private Voting의 해결책</h2>
        <div className="solution-grid">
          <div className="solution-card">
            <div className="solution-icon">🔐</div>
            <h3>완전한 비밀 보장</h3>
            <p>영지식 증명으로 투표 내용이 암호화됩니다. 결과 공개 전까지 <strong>그 누구도</strong> 볼 수 없습니다.</p>
          </div>
          <div className="solution-card">
            <div className="solution-icon">⚖️</div>
            <h3>공정한 영향력</h3>
            <p>Quadratic Voting으로 고래의 영향력을 제한합니다. 100배 자금 = 10배 영향력.</p>
          </div>
          <div className="solution-card">
            <div className="solution-icon">✅</div>
            <h3>수학적 검증</h3>
            <p>스마트 컨트랙트가 모든 투표를 암호학적으로 검증합니다. 조작 불가능.</p>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="compare-section">
        <h2>일반 투표 vs ZK 투표</h2>
        <div className="compare-table">
          <div className="compare-row compare-header">
            <div className="compare-cell"></div>
            <div className="compare-cell">일반 온체인 투표</div>
            <div className="compare-cell highlight">ZK Private Voting</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell label">투표 프라이버시</div>
            <div className="compare-cell bad">모든 투표 공개</div>
            <div className="compare-cell good">완전 비공개</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell label">고래 영향력</div>
            <div className="compare-cell bad">무제한</div>
            <div className="compare-cell good">제곱근으로 제한</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell label">외부 압력</div>
            <div className="compare-cell bad">취약</div>
            <div className="compare-cell good">면역</div>
          </div>
          <div className="compare-row">
            <div className="compare-cell label">결과 신뢰도</div>
            <div className="compare-cell neutral">컨트랙트 의존</div>
            <div className="compare-cell good">수학적 증명</div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="how-section">
        <h2>어떻게 작동하나요?</h2>
        <div className="flow-diagram-new">
          <div className="flow-step">
            <div className="flow-number">1</div>
            <h3>투표 제출</h3>
            <p>선택을 암호화하여 제출합니다. 블록체인에는 암호화된 데이터만 저장됩니다.</p>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-number">2</div>
            <h3>비밀 유지</h3>
            <p>투표 기간 동안 아무도 다른 사람의 선택을 볼 수 없습니다.</p>
          </div>
          <div className="flow-connector"></div>
          <div className="flow-step">
            <div className="flow-number">3</div>
            <h3>결과 공개</h3>
            <p>공개 기간에 투표를 공개하면 스마트 컨트랙트가 검증 후 집계합니다.</p>
          </div>
        </div>
      </section>

      {/* Quadratic Voting Section */}
      <section className="qv-section">
        <h2>Quadratic Voting</h2>
        <p className="section-subtitle">공정한 거버넌스를 위한 비용 구조</p>

        <div className="qv-visual">
          <div className="qv-formula-box">
            <span className="formula-label">비용 공식</span>
            <span className="formula-main">비용 = 투표수²</span>
          </div>

          <div className="qv-comparison">
            <div className="qv-person">
              <div className="qv-avatar small">🙂</div>
              <div className="qv-info">
                <span className="qv-name">일반 사용자</span>
                <span className="qv-balance">100 TON 보유</span>
                <span className="qv-result">→ 최대 10표</span>
              </div>
            </div>
            <div className="qv-vs">vs</div>
            <div className="qv-person">
              <div className="qv-avatar large">🐋</div>
              <div className="qv-info">
                <span className="qv-name">고래</span>
                <span className="qv-balance">10,000 TON 보유</span>
                <span className="qv-result">→ 최대 100표</span>
              </div>
            </div>
          </div>

          <p className="qv-conclusion">
            100배 자금 차이 → <strong>10배</strong> 영향력 차이
          </p>
        </div>
      </section>

      {/* Trust Section */}
      <section className="trust-section">
        <h2>왜 신뢰할 수 있나요?</h2>
        <div className="trust-grid">
          <div className="trust-item">
            <div className="trust-icon">🔬</div>
            <h3>오픈소스</h3>
            <p>모든 코드가 공개되어 있어 누구나 검증할 수 있습니다</p>
          </div>
          <div className="trust-item">
            <div className="trust-icon">⛓️</div>
            <h3>온체인 검증</h3>
            <p>모든 투표가 스마트 컨트랙트에서 검증됩니다</p>
          </div>
          <div className="trust-item">
            <div className="trust-icon">🧮</div>
            <h3>ZK 증명</h3>
            <p>Groth16 증명 시스템으로 수학적 보안 보장</p>
          </div>
          <div className="trust-item">
            <div className="trust-icon">🚫</div>
            <h3>조작 불가</h3>
            <p>Nullifier로 중복 투표 방지, 암호학적 무결성 보장</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section-new">
        <h2>직접 체험해보세요</h2>
        <p>Sepolia 테스트넷에서 ZK 비밀 투표를 경험하세요.</p>
        <div className="cta-buttons">
          <button className="cta-primary-new large" onClick={() => setCurrentPage('proposals')}>
            투표 참여하기
          </button>
          <a
            href="https://github.com/tokamak-network/zk-dex-d1-private-voting"
            target="_blank"
            rel="noopener noreferrer"
            className="cta-secondary-new large"
          >
            GitHub에서 보기
          </a>
        </div>
      </section>
    </div>
  )
}
