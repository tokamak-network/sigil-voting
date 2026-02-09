import type { Page } from '../types'

interface LandingPageProps {
  setCurrentPage: (page: Page) => void
}

export function LandingPage({ setCurrentPage }: LandingPageProps) {
  return (
    <div className="landing-page">
      <section className="hero-section-new">
        <div className="hero-badge-new">Sepolia Testnet</div>
        <h1 className="hero-title-new">ZK Private Voting</h1>
        <p className="hero-subtitle-new">
          영지식 증명으로 보호되는 비밀 투표.
          투표 내용은 암호화되고, Quadratic 비용으로 공정성을 보장합니다.
        </p>

        <div className="stats-bar">
          <div className="stat-item-new">
            <span className="stat-number">🔐</span>
            <span className="stat-label-new">비밀 투표</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item-new">
            <span className="stat-number">⚖️</span>
            <span className="stat-label-new">Quadratic 비용</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item-new">
            <span className="stat-number">✓</span>
            <span className="stat-label-new">온체인 검증</span>
          </div>
        </div>

        <div className="hero-cta-new">
          <button className="cta-primary-new" onClick={() => setCurrentPage('proposals')}>
            투표하기
          </button>
          <a href="https://github.com/tokamak-network/zk-dex" target="_blank" rel="noopener noreferrer" className="cta-secondary-new">
            GitHub
          </a>
        </div>
      </section>

      <section id="security" className="security-section">
        <h2>어떻게 작동하나요?</h2>
        <p className="section-subtitle">간단한 3단계</p>

        <div className="security-grid three-cols">
          <div className="security-card">
            <div className="security-icon">1️⃣</div>
            <h3>크레딧 받기</h3>
            <p>테스트용 10,000 크레딧을 받으세요. 이 크레딧으로 투표합니다.</p>
          </div>
          <div className="security-card">
            <div className="security-icon">2️⃣</div>
            <h3>제안 만들기</h3>
            <p>커뮤니티에 물어보고 싶은 질문을 제안으로 등록하세요.</p>
          </div>
          <div className="security-card">
            <div className="security-icon">3️⃣</div>
            <h3>투표하기</h3>
            <p>찬성 또는 반대를 선택하세요. 강도를 높이면 더 많은 크레딧이 소비됩니다.</p>
          </div>
        </div>
      </section>

      <section className="how-section">
        <h2>Quadratic Voting이란?</h2>
        <div className="qv-explain">
          <div className="qv-formula">
            <span className="formula">비용 = 투표수²</span>
          </div>
          <div className="qv-examples">
            <div className="qv-example">
              <span className="ex-votes">1표</span>
              <span className="ex-arrow">→</span>
              <span className="ex-cost">1 크레딧</span>
            </div>
            <div className="qv-example">
              <span className="ex-votes">10표</span>
              <span className="ex-arrow">→</span>
              <span className="ex-cost">100 크레딧</span>
            </div>
            <div className="qv-example highlight">
              <span className="ex-votes">100표</span>
              <span className="ex-arrow">→</span>
              <span className="ex-cost">10,000 크레딧</span>
            </div>
          </div>
          <p className="qv-benefit">
            💡 고래가 100배 더 많은 크레딧을 가져도 10배의 영향력만 행사할 수 있습니다.
          </p>
        </div>
      </section>

      <section className="compare-section">
        <h2>ZK 프라이버시</h2>
        <div className="flow-diagram">
          <div className="flow-phase">
            <h3>🔐 투표 제출</h3>
            <ul>
              <li>선택이 ZK 증명으로 암호화됨</li>
              <li>누구도 투표 내용을 볼 수 없음</li>
              <li>Nullifier로 중복 투표 방지</li>
            </ul>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-phase">
            <h3>🔓 결과 공개</h3>
            <ul>
              <li>공개 기간에 투표 내용 공개</li>
              <li>컨트랙트가 암호화 검증</li>
              <li>최종 결과 집계</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="cta-section-new">
        <h2>지금 시작하세요</h2>
        <p>Sepolia 테스트넷에서 ZK 투표를 체험해보세요.</p>
        <button className="cta-primary-new large" onClick={() => setCurrentPage('proposals')}>
          투표하기
        </button>
      </section>
    </div>
  )
}
