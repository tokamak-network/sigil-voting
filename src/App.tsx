import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from './wagmi'
import './App.css'

type Page = 'landing' | 'proposals' | 'proposal-detail' | 'my-votes' | 'create-proposal'
type ProposalStatus = 'active' | 'passed' | 'defeated'
type VoteChoice = 'for' | 'against' | 'abstain' | null
type VotingPhase = 'select' | 'sealing' | 'submitted'
type Language = 'ko' | 'en'

const translations = {
  ko: {
    // Header
    home: '홈',
    proposals: '제안',
    myVotes: '내 투표',
    connectWallet: '지갑 연결',
    connecting: '연결 중...',

    // Landing
    heroTitle: 'ZK 비밀 투표',
    heroSubtitle: '영지식 증명 기반 프라이버시 보호 투표 시스템.\n투표 참여는 공개, 선택은 비밀.',
    tryDemo: '데모 체험하기',
    howItWorks: '작동 방식 보기',

    // Comparison
    normalVoting: '일반 투표',
    zkVoting: 'ZK 비밀 투표',
    allChoicesPublic: '모든 선택이 공개됨',
    choicesProtected: '선택은 비밀로 보호됨',
    comparisonTitle: '일반 투표 vs ZK 비밀 투표',
    normalOnchainVoting: '일반 온체인 투표',
    proposalSystem: '제안 시스템',
    tokenBasedVoting: '토큰 기반 투표권',
    onchainRecord: '온체인 기록',
    publicVoting: '공개 투표 (모든 선택 노출)',
    existingMethod: '기존 방식',
    zkPrivateVoting: 'zkDEX D1 비밀 투표',
    zkProofVoting: 'ZK 증명 기반 비밀 투표',
    commitmentOnly: '커밋먼트 해시만 온체인 기록',
    onlyFinalResult: '최종 결과만 공개',
    permanentSecret: '개별 선택은 영구 비밀',
    thisDemo: '이 데모',

    // Problem Section
    whyPrivateVoting: '왜 비밀 투표가 필요한가?',
    voteBuying: '투표 매수',
    voteBuyingDesc: '공개 투표에서는 특정 선택에 대해 보상을 제안하여 투표를 매수할 수 있습니다.',
    socialPressure: '사회적 압력',
    socialPressureDesc: '다수의 의견과 다른 선택을 하면 커뮤니티에서 불이익을 받을 수 있습니다.',
    retaliationRisk: '보복 위험',
    retaliationRiskDesc: '대형 홀더가 반대표를 던진 사람을 식별하고 보복할 수 있습니다.',

    // How it works
    howItWorksTitle: '어떻게 작동하나요?',
    step1Title: '선택하기',
    step1Desc: '찬성, 반대, 기권 중 하나를 선택합니다.',
    step2Title: 'ZK 증명 생성',
    step2Desc: '선택을 암호화하고 유효성을 증명하는 영지식 증명을 생성합니다.',
    step3Title: '커밋먼트 제출',
    step3Desc: '블록체인에는 암호화된 커밋먼트만 기록됩니다.',
    step4Title: '결과 집계',
    step4Desc: '투표 종료 후 최종 결과만 공개됩니다. 개별 선택은 비밀입니다.',

    // Benefits
    benefitsTitle: 'ZK 비밀 투표의 장점',
    privacyProtection: '프라이버시 보호',
    privacyProtectionDesc: '당신의 선택은 오직 당신만 압니다.',
    verifiable: '검증 가능',
    verifiableDesc: '투표가 올바르게 집계되었는지 누구나 검증할 수 있습니다.',
    onchainRecordBenefit: '온체인 기록',
    onchainRecordBenefitDesc: '모든 투표는 블록체인에 영구적으로 기록됩니다.',
    honestExpression: '솔직한 의사표현',
    honestExpressionDesc: '외부 압력 없이 진정한 의견을 표현할 수 있습니다.',
    antiCoercion: '강압 방지',
    antiCoercionDesc: '투표자가 매수자에게 자신의 선택을 증명할 수 없어 강압이 불가능합니다.',
    doubleVotePrevention: '이중투표 방지',
    doubleVotePreventionDesc: 'Nullifier 시스템으로 동일한 토큰으로 두 번 투표하는 것을 방지합니다.',

    // Use Cases
    useCasesTitle: '활용 사례',
    useCase1Title: '프로토콜 파라미터 변경',
    useCase1Desc: 'DAO가 수수료를 0.3%에서 0.25%로 조정하는 제안. 대형 홀더가 소규모 홀더에게 영향을 미칠 수 없습니다.',
    useCase2Title: '트레저리 그랜트 배분',
    useCase2Desc: '여러 프로젝트가 펀딩을 위해 경쟁. 비밀 투표로 조정 공격과 편승 효과를 방지합니다.',
    useCase3Title: '논쟁적 거버넌스 결정',
    useCase3Desc: '논란이 있는 프로토콜 변경에 대한 투표. 소수 의견도 사회적 압력 없이 표현 가능합니다.',
    useCase4Title: '이사회 선거',
    useCase4Desc: 'DAO 카운슬 멤버 선출. 비밀 투표로 후보 간 투표 거래를 방지합니다.',

    // Security
    securityTitle: '보안 특성',
    security1Title: '매수 방지',
    security1Desc: '커밋먼트 스킴으로 투표자가 매수자에게 선택을 증명할 수 없습니다.',
    security2Title: 'Nullifier 시스템',
    security2Desc: '노트 + 제안ID에서 파생된 고유 Nullifier로 이중투표를 방지합니다.',
    security3Title: '스냅샷 검증',
    security3Desc: '과거 블록 해시 사용 및 온체인 머클루트 커밋으로 조작을 방지합니다.',

    // Commit-Reveal
    commitRevealTitle: 'Commit-Reveal 메커니즘',
    commitRevealDesc: '2단계 투표 프로세스로 투표 매수와 강압을 원천 차단합니다.',
    commitPhase: 'Commit 단계',
    commitPhaseDesc: '투표 선택을 암호화한 커밋먼트만 블록체인에 기록. 아무도 선택을 알 수 없음.',
    revealPhase: 'Reveal 단계',
    revealPhaseDesc: '투표 종료 후 모든 커밋먼트를 복호화하여 집계. 최종 결과만 공개.',

    // FAQ
    faqTitle: '자주 묻는 질문',
    faq1Q: '영지식 증명(ZK)이 뭔가요?',
    faq1A: '어떤 정보를 알고 있다는 것을 그 정보 자체를 공개하지 않고 증명하는 암호학 기술입니다. 투표에서는 "유효한 선택을 했다"는 것을 증명하면서 "어떤 선택을 했는지"는 숨길 수 있습니다.',
    faq2Q: '내 투표가 제대로 반영되었는지 어떻게 알 수 있나요?',
    faq2A: '투표 후 받는 커밋먼트 해시로 확인할 수 있습니다. 이 해시는 당신의 선택을 암호화한 것으로, 최종 집계 시 포함되었는지 검증할 수 있습니다.',
    faq3Q: '나중에 내 선택이 공개될 수 있나요?',
    faq3A: '아니요. 영지식 증명의 특성상 암호화된 커밋먼트에서 원래 선택을 역추적하는 것은 수학적으로 불가능합니다.',
    faq4Q: '투표 결과 조작은 불가능한가요?',
    faq4A: '네. 모든 투표와 집계 과정은 블록체인에 기록되고, ZK 증명을 통해 누구나 결과의 정확성을 검증할 수 있습니다.',

    // CTA
    ctaTitle: 'zkDEX D1 비밀 투표 체험하기',
    ctaDesc: 'ZK 비밀 투표가 어떻게 작동하는지 직접 체험해보세요.',
    startDemo: '데모 시작하기',
    ctaNote: '* 이 데모는 Ethereum Sepolia 테스트넷에서 작동합니다.',

    // Proposals Page
    governanceProposals: '거버넌스 제안',
    governanceProposalsDesc: 'Tokamak Network의 미래를 결정하는 투표에 참여하세요',
    inProgress: '진행 중',
    total: '전체',
    newProposal: '+ 새 제안',
    all: '전체',
    active: '진행 중',
    closed: '종료',
    participants: '명 참여',
    deadline: '마감',
    ended: '종료',

    // Status
    statusActive: '진행 중',
    statusPassed: '가결',
    statusDefeated: '부결',

    // Time
    ended2: '종료됨',
    daysHoursLeft: '일 시간 남음',
    hoursMinutesLeft: '시간 분 남음',
    minutesLeft: '분 남음',

    // Voting
    voteFor: '찬성',
    voteAgainst: '반대',
    voteAbstain: '기권',
    submitVote: 'ZK 증명으로 투표 제출',
    zkNotice: 'ZK 비밀 투표',
    zkNoticeDesc: '투표 선택은 암호화됩니다. 최종 집계 결과만 공개됩니다.',

    // Sealing
    generatingProof: 'ZK 증명 생성 중...',
    encryptingChoice: '투표 선택 암호화 중...',
    generatingZK: '영지식 증명 생성 중...',
    generatingCommitment: '커밋먼트 해시 생성 중...',
    submittingToChain: '블록체인에 제출 중...',

    // Vote Complete
    voteComplete: '투표 완료!',
    commitmentRecorded: '블록체인에 기록된 커밋먼트:',
    othersCanSee: '다른 사람이 보는 것',
    onlyYouKnow: '당신만 아는 것',

    // Proposal Detail
    backToList: '← 목록으로',
    details: '상세 내용',
    voting: '투표하기',
    connectToVote: '투표하려면 지갑을 연결하세요',
    votingClosed: '투표 종료',
    noMoreVotes: '이 제안은 더 이상 투표를 받지 않습니다.',
    currentResult: '현재 결과',
    info: '정보',
    participantCount: '참여자 수',
    totalVotes: '총 투표량',
    proposer: '제안자',

    // Create Proposal
    createProposal: '새 제안 만들기',
    createProposalDesc: 'Tokamak Network 커뮤니티에 제안을 제출하세요',
    connectWalletRequired: '지갑을 연결하세요',
    connectWalletToCreate: '제안을 만들려면 지갑 연결이 필요합니다',
    insufficientVotingPower: '투표권 부족',
    minimumRequired: '제안을 만들려면 최소 100 TON이 필요합니다.',
    currentHolding: '현재 보유',
    title: '제목',
    titlePlaceholder: '제안 제목을 입력하세요',
    category: '카테고리',
    votingPeriod: '투표 기간',
    days: '일',
    recommended: '권장',
    description: '상세 내용',
    descriptionPlaceholder: '제안의 배경, 목표, 구체적인 실행 계획 등을 작성하세요. 마크다운 형식을 지원합니다.',
    characters: '자',
    proposalRequirements: '제안 요구사항',
    minimumHolding: '최소 100 TON 보유 필요',
    quorum: '정족수',
    quorumDesc: '통과를 위해 최소 4,000,000 TON 참여 필요',
    zkEncrypted: '모든 투표는 ZK 증명으로 암호화됩니다',
    cancel: '취소',
    submitProposal: '제안 제출',

    // My Votes Page
    myVotesTitle: '내 투표',
    myVotesDesc: 'Tokamak Network 거버넌스 투표 기록',
    myVotingPower: '내 투표권',
    connectToSeeVotes: '투표 기록을 보려면 지갑 연결이 필요합니다',
    noVoteHistory: '투표 기록 없음',
    noVotesYet: '아직 참여한 투표가 없습니다.',
    browseProposals: '제안 둘러보기',
    zkEncryptedNote: 'ZK 암호화됨',

    // Categories
    catGeneral: '일반',
    catTreasury: '트레저리',
    catProtocol: '프로토콜',
    catValidator: '검증자',
    catSecurity: '보안',
    catMarketing: '마케팅',
    catPartnership: '파트너십',
  },
  en: {
    // Header
    home: 'Home',
    proposals: 'Proposals',
    myVotes: 'My Votes',
    connectWallet: 'Connect Wallet',
    connecting: 'Connecting...',

    // Landing
    heroTitle: 'ZK Private Voting',
    heroSubtitle: 'Privacy-preserving voting system based on zero-knowledge proofs.\nParticipation is public, choices are secret.',
    tryDemo: 'Try Demo',
    howItWorks: 'See How It Works',

    // Comparison
    normalVoting: 'Normal Voting',
    zkVoting: 'ZK Private Voting',
    allChoicesPublic: 'All choices are public',
    choicesProtected: 'Choices are protected',
    comparisonTitle: 'Normal Voting vs ZK Private Voting',
    normalOnchainVoting: 'Normal On-chain Voting',
    proposalSystem: 'Proposal system',
    tokenBasedVoting: 'Token-based voting power',
    onchainRecord: 'On-chain record',
    publicVoting: 'Public voting (all choices exposed)',
    existingMethod: 'Existing Method',
    zkPrivateVoting: 'zkDEX D1 Private Voting',
    zkProofVoting: 'ZK proof-based private voting',
    commitmentOnly: 'Only commitment hash recorded on-chain',
    onlyFinalResult: 'Only final result revealed',
    permanentSecret: 'Individual choices remain secret forever',
    thisDemo: 'This Demo',

    // Problem Section
    whyPrivateVoting: 'Why Private Voting?',
    voteBuying: 'Vote Buying',
    voteBuyingDesc: 'In public voting, votes can be bought by offering rewards for specific choices.',
    socialPressure: 'Social Pressure',
    socialPressureDesc: 'Making different choices from the majority can lead to disadvantages in the community.',
    retaliationRisk: 'Retaliation Risk',
    retaliationRiskDesc: 'Large holders can identify and retaliate against those who voted against them.',

    // How it works
    howItWorksTitle: 'How Does It Work?',
    step1Title: 'Make a Choice',
    step1Desc: 'Choose one of: For, Against, or Abstain.',
    step2Title: 'Generate ZK Proof',
    step2Desc: 'Generate a zero-knowledge proof that encrypts your choice and proves its validity.',
    step3Title: 'Submit Commitment',
    step3Desc: 'Only the encrypted commitment is recorded on the blockchain.',
    step4Title: 'Tally Results',
    step4Desc: 'After voting ends, only the final result is revealed. Individual choices remain secret.',

    // Benefits
    benefitsTitle: 'Benefits of ZK Private Voting',
    privacyProtection: 'Privacy Protection',
    privacyProtectionDesc: 'Only you know your choice.',
    verifiable: 'Verifiable',
    verifiableDesc: 'Anyone can verify that votes were tallied correctly.',
    onchainRecordBenefit: 'On-chain Record',
    onchainRecordBenefitDesc: 'All votes are permanently recorded on the blockchain.',
    honestExpression: 'Honest Expression',
    honestExpressionDesc: 'Express your true opinion without external pressure.',
    antiCoercion: 'Anti-Coercion',
    antiCoercionDesc: 'Voters cannot prove their choice to potential bribers, making coercion impossible.',
    doubleVotePrevention: 'Double-Vote Prevention',
    doubleVotePreventionDesc: 'Nullifier system prevents the same tokens from voting twice.',

    // Use Cases
    useCasesTitle: 'Use Cases',
    useCase1Title: 'Protocol Parameter Changes',
    useCase1Desc: 'DAO proposes fee adjustment from 0.3% to 0.25%. Whales cannot signal to influence smaller holders.',
    useCase2Title: 'Treasury Grant Allocation',
    useCase2Desc: 'Multiple projects compete for funding. Private voting prevents coordination attacks and bandwagon effects.',
    useCase3Title: 'Contentious Governance Decisions',
    useCase3Desc: 'Voting on controversial protocol changes. Minority opinions can be expressed without social pressure.',
    useCase4Title: 'Board Elections',
    useCase4Desc: 'DAO elects council members. Private voting prevents vote trading between candidates.',

    // Security
    securityTitle: 'Security Features',
    security1Title: 'Anti-Bribery',
    security1Desc: 'Commitment scheme ensures voters cannot prove their choice to buyers.',
    security2Title: 'Nullifier System',
    security2Desc: 'Unique nullifier derived from note + proposalId prevents double voting.',
    security3Title: 'Snapshot Verification',
    security3Desc: 'Uses past block hash and on-chain merkle root commitment to prevent manipulation.',

    // Commit-Reveal
    commitRevealTitle: 'Commit-Reveal Mechanism',
    commitRevealDesc: 'Two-phase voting process that fundamentally prevents vote buying and coercion.',
    commitPhase: 'Commit Phase',
    commitPhaseDesc: 'Only encrypted commitment is recorded on-chain. No one can see your choice.',
    revealPhase: 'Reveal Phase',
    revealPhaseDesc: 'After voting ends, all commitments are decrypted for tallying. Only final result is public.',

    // FAQ
    faqTitle: 'Frequently Asked Questions',
    faq1Q: 'What is Zero-Knowledge Proof (ZK)?',
    faq1A: 'A cryptographic technique that proves you know something without revealing what it is. In voting, you can prove you made a valid choice without revealing what that choice was.',
    faq2Q: 'How can I verify my vote was counted?',
    faq2A: 'You can verify using the commitment hash you receive after voting. This hash encrypts your choice and can be verified to be included in the final tally.',
    faq3Q: 'Can my choice be revealed later?',
    faq3A: 'No. Due to the nature of zero-knowledge proofs, it is mathematically impossible to reverse-engineer the original choice from the encrypted commitment.',
    faq4Q: 'Is it impossible to manipulate voting results?',
    faq4A: 'Yes. All votes and tallying processes are recorded on the blockchain, and anyone can verify the accuracy of results through ZK proofs.',

    // CTA
    ctaTitle: 'Try zkDEX D1 Private Voting',
    ctaDesc: 'Experience how ZK private voting works firsthand.',
    startDemo: 'Start Demo',
    ctaNote: '* This demo runs on Ethereum Sepolia testnet.',

    // Proposals Page
    governanceProposals: 'Governance Proposals',
    governanceProposalsDesc: 'Participate in votes that shape the future of Tokamak Network',
    inProgress: 'Active',
    total: 'Total',
    newProposal: '+ New Proposal',
    all: 'All',
    active: 'Active',
    closed: 'Closed',
    participants: ' voted',
    deadline: 'Deadline',
    ended: 'Ended',

    // Status
    statusActive: 'Active',
    statusPassed: 'Passed',
    statusDefeated: 'Defeated',

    // Time
    ended2: 'Ended',
    daysHoursLeft: 'd h left',
    hoursMinutesLeft: 'h m left',
    minutesLeft: 'm left',

    // Voting
    voteFor: 'For',
    voteAgainst: 'Against',
    voteAbstain: 'Abstain',
    submitVote: 'Submit Vote with ZK Proof',
    zkNotice: 'ZK Private Voting',
    zkNoticeDesc: 'Your vote choice is encrypted. Only the final tally is revealed.',

    // Sealing
    generatingProof: 'Generating ZK Proof...',
    encryptingChoice: 'Encrypting vote choice...',
    generatingZK: 'Generating zero-knowledge proof...',
    generatingCommitment: 'Creating commitment hash...',
    submittingToChain: 'Submitting to blockchain...',

    // Vote Complete
    voteComplete: 'Vote Complete!',
    commitmentRecorded: 'Commitment recorded on blockchain:',
    othersCanSee: 'What others see',
    onlyYouKnow: 'What only you know',

    // Proposal Detail
    backToList: '← Back to List',
    details: 'Details',
    voting: 'Cast Your Vote',
    connectToVote: 'Connect wallet to vote',
    votingClosed: 'Voting Closed',
    noMoreVotes: 'This proposal is no longer accepting votes.',
    currentResult: 'Current Results',
    info: 'Information',
    participantCount: 'Participants',
    totalVotes: 'Total Votes',
    proposer: 'Proposer',

    // Create Proposal
    createProposal: 'Create New Proposal',
    createProposalDesc: 'Submit a proposal to the Tokamak Network community',
    connectWalletRequired: 'Connect Your Wallet',
    connectWalletToCreate: 'Wallet connection is required to create a proposal',
    insufficientVotingPower: 'Insufficient Voting Power',
    minimumRequired: 'Minimum 100 TON required to create a proposal.',
    currentHolding: 'Current holding',
    title: 'Title',
    titlePlaceholder: 'Enter proposal title',
    category: 'Category',
    votingPeriod: 'Voting Period',
    days: ' days',
    recommended: 'Recommended',
    description: 'Description',
    descriptionPlaceholder: 'Write the background, goals, and specific implementation plans. Markdown is supported.',
    characters: ' chars',
    proposalRequirements: 'Proposal Requirements',
    minimumHolding: 'Minimum 100 TON holding required',
    quorum: 'Quorum',
    quorumDesc: 'Minimum 4,000,000 TON participation required to pass',
    zkEncrypted: 'All votes are encrypted with ZK proofs',
    cancel: 'Cancel',
    submitProposal: 'Submit Proposal',

    // My Votes Page
    myVotesTitle: 'My Votes',
    myVotesDesc: 'Tokamak Network governance voting history',
    myVotingPower: 'My Voting Power',
    connectToSeeVotes: 'Connect wallet to see voting history',
    noVoteHistory: 'No Vote History',
    noVotesYet: 'You haven\'t participated in any votes yet.',
    browseProposals: 'Browse Proposals',
    zkEncryptedNote: 'ZK Encrypted',

    // Categories
    catGeneral: 'General',
    catTreasury: 'Treasury',
    catProtocol: 'Protocol',
    catValidator: 'Validator',
    catSecurity: 'Security',
    catMarketing: 'Marketing',
    catPartnership: 'Partnership',
  }
}

interface Proposal {
  id: string
  title: string
  description: string
  status: ProposalStatus
  forVotes: number
  againstVotes: number
  abstainVotes: number
  totalVoters: number
  endTime: Date
  author: string
  category: string
}

interface MyVote {
  proposalId: string
  proposalTitle: string
  choice: VoteChoice
  commitment: string
  votingPower: number
  timestamp: string
}

// Sample data
const initialProposals: Proposal[] = [
  {
    id: 'TIP-42',
    title: '생태계 그랜트 프로그램 예산 배정',
    description: '개발자 온보딩 및 Tokamak Network dApp 개발 지원을 위해 트레저리에서 500,000 TON을 생태계 그랜트 프로그램에 배정합니다.\n\n## 배경\n현재 Tokamak Network 생태계는 성장기에 있으며, 더 많은 개발자 유입이 필요합니다.\n\n## 목표\n- Q2까지 20개 이상의 신규 dApp 유치\n- 개발자 교육 프로그램 운영\n- 해커톤 개최 (분기당 1회)',
    status: 'active',
    forVotes: 1850000,
    againstVotes: 920000,
    abstainVotes: 230000,
    totalVoters: 156,
    endTime: new Date('2026-02-10T18:00:00'),
    author: '0x1a2b...3c4d',
    category: '트레저리',
  },
  {
    id: 'TIP-41',
    title: '스테이킹 보상률 조정',
    description: '프로토콜의 장기적 지속가능성을 위해 연간 스테이킹 보상률을 19%에서 15%로 인하합니다.',
    status: 'active',
    forVotes: 2100000,
    againstVotes: 1800000,
    abstainVotes: 100000,
    totalVoters: 203,
    endTime: new Date('2026-02-08T12:00:00'),
    author: '0x5e6f...7g8h',
    category: '프로토콜',
  },
  {
    id: 'TIP-40',
    title: '검증자 요구사항 강화',
    description: '검증자 최소 스테이킹 요구량을 100,000 TON에서 250,000 TON으로 상향 조정합니다.',
    status: 'passed',
    forVotes: 3200000,
    againstVotes: 800000,
    abstainVotes: 200000,
    totalVoters: 312,
    endTime: new Date('2026-01-25T18:00:00'),
    author: '0x9i0j...1k2l',
    category: '검증자',
  },
  {
    id: 'TIP-39',
    title: '긴급 보안 기금 조성',
    description: '잠재적 보안 사고 대응을 위해 1,000,000 TON 규모의 긴급 기금을 조성합니다.',
    status: 'passed',
    forVotes: 4500000,
    againstVotes: 300000,
    abstainVotes: 150000,
    totalVoters: 428,
    endTime: new Date('2026-01-20T18:00:00'),
    author: '0x3m4n...5o6p',
    category: '보안',
  },
  {
    id: 'TIP-38',
    title: '마케팅 예산 증액',
    description: '분기별 마케팅 예산을 50,000 TON에서 150,000 TON으로 증액합니다.',
    status: 'defeated',
    forVotes: 1200000,
    againstVotes: 2800000,
    abstainVotes: 400000,
    totalVoters: 289,
    endTime: new Date('2026-01-15T18:00:00'),
    author: '0x7q8r...9s0t',
    category: '마케팅',
  },
]

function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: sepolia.id })
    } catch (error) {
      console.error('Network switch failed:', error)
      // If switch fails, try adding the network manually
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia chainId in hex
          })
        } catch (switchError: unknown) {
          // If network doesn't exist, add it
          if (switchError && typeof switchError === 'object' && 'code' in switchError && switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            })
          }
        }
      }
    }
  }

  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [votingPhase, setVotingPhase] = useState<VotingPhase>('select')
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice>(null)
  const [sealProgress, setSealProgress] = useState(0)
  const [myCommitment, setMyCommitment] = useState('')
  const [myVotes, setMyVotes] = useState<MyVote[]>([
    {
      proposalId: 'TIP-40',
      proposalTitle: '검증자 요구사항 강화',
      choice: 'for',
      commitment: '0x7a3b...f291',
      votingPower: 350,
      timestamp: '2026-01-24 14:30'
    },
    {
      proposalId: 'TIP-39',
      proposalTitle: '긴급 보안 기금 조성',
      choice: 'for',
      commitment: '0x8c4d...e382',
      votingPower: 350,
      timestamp: '2026-01-19 11:15'
    },
  ])
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals)
  const [votingPower] = useState(350)
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all')
  const [, setNow] = useState(new Date())
  const [lang, setLang] = useState<Language>('ko')
  const t = translations[lang]

  // Create Proposal Form States
  const [newProposal, setNewProposal] = useState({
    title: '',
    description: '',
    category: '일반',
    duration: 7
  })

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const isCorrectChain = chainId === sepolia.id

  const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K'
    return num.toString()
  }

  const getTimeRemaining = (endTime: Date) => {
    const now = new Date()
    const diff = endTime.getTime() - now.getTime()
    if (diff <= 0) return t.ended2

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (lang === 'ko') {
      if (days > 0) return `${days}일 ${hours}시간 남음`
      if (hours > 0) return `${hours}시간 ${minutes}분 남음`
      return `${minutes}분 남음`
    } else {
      if (days > 0) return `${days}d ${hours}h left`
      if (hours > 0) return `${hours}h ${minutes}m left`
      return `${minutes}m left`
    }
  }

  const getStatusColor = (status: ProposalStatus) => {
    switch (status) {
      case 'active': return 'status-active'
      case 'passed': return 'status-passed'
      case 'defeated': return 'status-defeated'
    }
  }

  const getStatusLabel = (status: ProposalStatus) => {
    switch (status) {
      case 'active': return t.statusActive
      case 'passed': return t.statusPassed
      case 'defeated': return t.statusDefeated
    }
  }

  const createProposal = () => {
    if (!newProposal.title || !newProposal.description || !isConnected) return

    const now = new Date()
    const endTime = new Date(now.getTime() + newProposal.duration * 24 * 60 * 60 * 1000)

    const proposal: Proposal = {
      id: `TIP-${43 + proposals.length}`,
      title: newProposal.title,
      description: newProposal.description,
      status: 'active',
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      totalVoters: 0,
      endTime: endTime,
      author: shortenAddress(address!),
      category: newProposal.category,
    }

    setProposals(prev => [proposal, ...prev])
    setNewProposal({ title: '', description: '', category: '일반', duration: 7 })
    setCurrentPage('proposals')
  }

  const generateCommitment = () => {
    return '0x' + Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('') + '...' + Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }

  const openProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setCurrentPage('proposal-detail')
    setVotingPhase('select')
    setSelectedChoice(null)
    setSealProgress(0)
    setMyCommitment('')
  }

  const startSealing = async () => {
    if (!selectedChoice || !selectedProposal) return
    setVotingPhase('sealing')
    setSealProgress(0)

    for (let i = 0; i <= 100; i += 2) {
      await new Promise(r => setTimeout(r, 40))
      setSealProgress(i)
    }

    const commitment = generateCommitment()
    setMyCommitment(commitment)

    // Update proposal vote counts
    setProposals(prev => prev.map(p => {
      if (p.id === selectedProposal.id) {
        return {
          ...p,
          forVotes: selectedChoice === 'for' ? p.forVotes + votingPower : p.forVotes,
          againstVotes: selectedChoice === 'against' ? p.againstVotes + votingPower : p.againstVotes,
          abstainVotes: selectedChoice === 'abstain' ? p.abstainVotes + votingPower : p.abstainVotes,
          totalVoters: p.totalVoters + 1
        }
      }
      return p
    }))

    // Update selected proposal for immediate UI update
    setSelectedProposal(prev => {
      if (!prev) return prev
      return {
        ...prev,
        forVotes: selectedChoice === 'for' ? prev.forVotes + votingPower : prev.forVotes,
        againstVotes: selectedChoice === 'against' ? prev.againstVotes + votingPower : prev.againstVotes,
        abstainVotes: selectedChoice === 'abstain' ? prev.abstainVotes + votingPower : prev.abstainVotes,
        totalVoters: prev.totalVoters + 1
      }
    })

    setMyVotes(prev => [{
      proposalId: selectedProposal.id,
      proposalTitle: selectedProposal.title,
      choice: selectedChoice,
      commitment,
      votingPower,
      timestamp: new Date().toLocaleString()
    }, ...prev])

    await new Promise(r => setTimeout(r, 500))
    setVotingPhase('submitted')
  }

  const filteredProposals = proposals.filter(p => {
    if (filter === 'all') return true
    if (filter === 'active') return p.status === 'active'
    if (filter === 'closed') return p.status === 'passed' || p.status === 'defeated'
    return true
  })

  const handleConnect = () => connect({ connector: injected() })

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo" onClick={() => setCurrentPage('landing')}>
            <span className="logo-icon">🔐</span>
            <span className="logo-text">ZK Vote</span>
          </div>
          <nav className="nav">
            <button
              className={`nav-item ${currentPage === 'landing' ? 'active' : ''}`}
              onClick={() => setCurrentPage('landing')}
            >
              {t.home}
            </button>
            <button
              className={`nav-item ${currentPage === 'proposals' || currentPage === 'proposal-detail' || currentPage === 'create-proposal' ? 'active' : ''}`}
              onClick={() => setCurrentPage('proposals')}
            >
              {t.proposals}
            </button>
            <button
              className={`nav-item ${currentPage === 'my-votes' ? 'active' : ''}`}
              onClick={() => setCurrentPage('my-votes')}
            >
              {t.myVotes}
            </button>
          </nav>
        </div>

        <div className="header-right">
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
          >
            {lang === 'ko' ? 'EN' : 'KO'}
          </button>
          {isConnected ? (
            <div className="wallet-connected">
              <span className={`chain-badge ${isCorrectChain ? 'correct' : 'wrong'}`}>
                {isCorrectChain ? 'Sepolia' : 'Wrong Network'}
              </span>
              {!isCorrectChain && (
                <button
                  className="switch-btn"
                  onClick={handleSwitchNetwork}
                  disabled={isSwitching}
                >
                  {isSwitching ? 'Switching...' : 'Switch'}
                </button>
              )}
              <div className="wallet-info">
                <span className="voting-power-badge">{formatNumber(votingPower)} TON</span>
                <span className="wallet-address">{shortenAddress(address!)}</span>
              </div>
              <button className="disconnect-btn" onClick={() => disconnect()}>×</button>
            </div>
          ) : (
            <button className="connect-btn" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? t.connecting : t.connectWallet}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {/* Landing Page */}
        {currentPage === 'landing' && (
          <div className="landing-page">
            {/* Hero Section */}
            <section className="hero-section">
              <div className="hero-content">
                <div className="hero-badge">zkDEX D1 Module</div>
                <h1>{t.heroTitle}</h1>
                <p className="hero-subtitle">
                  {t.heroSubtitle.split('\n')[0]}<br />
                  {t.heroSubtitle.split('\n')[1]}
                </p>
                <div className="hero-buttons">
                  <button className="hero-btn primary" onClick={() => setCurrentPage('proposals')}>
                    {t.tryDemo}
                  </button>
                  <a href="#how-it-works" className="hero-btn secondary">
                    {t.howItWorks}
                  </a>
                </div>
                <div className="hero-network">
                  <span className="network-badge">Ethereum Sepolia Testnet</span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="visual-comparison">
                  <div className="visual-card bad">
                    <div className="visual-header">{t.normalVoting}</div>
                    <div className="visual-content">
                      <div className="visual-row">
                        <span>👤 Alice</span>
                        <span>→</span>
                        <span className="vote-visible">👍 {t.voteFor}</span>
                      </div>
                      <div className="visual-row">
                        <span>👤 Bob</span>
                        <span>→</span>
                        <span className="vote-visible">👎 {t.voteAgainst}</span>
                      </div>
                    </div>
                    <div className="visual-tag bad">{t.allChoicesPublic}</div>
                  </div>
                  <div className="visual-arrow">→</div>
                  <div className="visual-card good">
                    <div className="visual-header">{t.zkVoting}</div>
                    <div className="visual-content">
                      <div className="visual-row">
                        <span>👤 Alice</span>
                        <span>→</span>
                        <span className="vote-hidden">🔒 0x7f3a...</span>
                      </div>
                      <div className="visual-row">
                        <span>👤 Bob</span>
                        <span>→</span>
                        <span className="vote-hidden">🔒 0x9b2c...</span>
                      </div>
                    </div>
                    <div className="visual-tag good">{t.choicesProtected}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Comparison Section */}
            <section className="upgrade-section">
              <h2>{t.comparisonTitle}</h2>
              <div className="upgrade-comparison">
                <div className="upgrade-card current">
                  <div className="upgrade-header">
                    <span className="upgrade-icon">📋</span>
                    <h3>{t.normalOnchainVoting}</h3>
                  </div>
                  <ul className="upgrade-features">
                    <li>✅ {t.proposalSystem}</li>
                    <li>✅ {t.tokenBasedVoting}</li>
                    <li>✅ {t.onchainRecord}</li>
                    <li className="negative">❌ {t.publicVoting}</li>
                  </ul>
                  <div className="upgrade-tag current">{t.existingMethod}</div>
                </div>
                <div className="upgrade-arrow">→</div>
                <div className="upgrade-card new">
                  <div className="upgrade-header">
                    <span className="upgrade-icon">🔐</span>
                    <h3>{t.zkPrivateVoting}</h3>
                  </div>
                  <ul className="upgrade-features">
                    <li>🔒 {t.zkProofVoting}</li>
                    <li>🔒 {t.commitmentOnly}</li>
                    <li>🔒 {t.onlyFinalResult}</li>
                    <li>🔒 {t.permanentSecret}</li>
                  </ul>
                  <div className="upgrade-tag new">{t.thisDemo}</div>
                </div>
              </div>
            </section>

            {/* Problem Section */}
            <section className="problem-section">
              <h2>{t.whyPrivateVoting}</h2>
              <div className="problem-grid">
                <div className="problem-card">
                  <div className="problem-icon">💰</div>
                  <h3>{t.voteBuying}</h3>
                  <p>{t.voteBuyingDesc}</p>
                </div>
                <div className="problem-card">
                  <div className="problem-icon">😰</div>
                  <h3>{t.socialPressure}</h3>
                  <p>{t.socialPressureDesc}</p>
                </div>
                <div className="problem-card">
                  <div className="problem-icon">🎯</div>
                  <h3>{t.retaliationRisk}</h3>
                  <p>{t.retaliationRiskDesc}</p>
                </div>
              </div>
            </section>

            {/* How it Works Section */}
            <section className="how-section" id="how-it-works">
              <h2>{t.howItWorksTitle}</h2>
              <div className="how-steps">
                <div className="how-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>{t.step1Title}</h3>
                    <p>{t.step1Desc}</p>
                  </div>
                </div>
                <div className="how-arrow">→</div>
                <div className="how-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>{t.step2Title}</h3>
                    <p>{t.step2Desc}</p>
                  </div>
                </div>
                <div className="how-arrow">→</div>
                <div className="how-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>{t.step3Title}</h3>
                    <p>{t.step3Desc}</p>
                  </div>
                </div>
                <div className="how-arrow">→</div>
                <div className="how-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>{t.step4Title}</h3>
                    <p>{t.step4Desc}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Benefits Section */}
            <section className="benefits-section">
              <h2>{t.benefitsTitle}</h2>
              <div className="benefits-grid">
                <div className="benefit-card">
                  <div className="benefit-icon">🛡️</div>
                  <h3>{t.privacyProtection}</h3>
                  <p>{t.privacyProtectionDesc}</p>
                </div>
                <div className="benefit-card">
                  <div className="benefit-icon">✅</div>
                  <h3>{t.verifiable}</h3>
                  <p>{t.verifiableDesc}</p>
                </div>
                <div className="benefit-card">
                  <div className="benefit-icon">🔗</div>
                  <h3>{t.onchainRecordBenefit}</h3>
                  <p>{t.onchainRecordBenefitDesc}</p>
                </div>
                <div className="benefit-card">
                  <div className="benefit-icon">🎭</div>
                  <h3>{t.honestExpression}</h3>
                  <p>{t.honestExpressionDesc}</p>
                </div>
                <div className="benefit-card">
                  <div className="benefit-icon">🚫</div>
                  <h3>{t.antiCoercion}</h3>
                  <p>{t.antiCoercionDesc}</p>
                </div>
                <div className="benefit-card">
                  <div className="benefit-icon">🔒</div>
                  <h3>{t.doubleVotePrevention}</h3>
                  <p>{t.doubleVotePreventionDesc}</p>
                </div>
              </div>
            </section>

            {/* Commit-Reveal Section */}
            <section className="commit-reveal-section">
              <h2>{t.commitRevealTitle}</h2>
              <p className="section-desc">{t.commitRevealDesc}</p>
              <div className="commit-reveal-phases">
                <div className="phase-card commit">
                  <div className="phase-number">1</div>
                  <h3>{t.commitPhase}</h3>
                  <p>{t.commitPhaseDesc}</p>
                  <div className="phase-visual">
                    <code>vote + salt → hash(commitment)</code>
                  </div>
                </div>
                <div className="phase-arrow">→</div>
                <div className="phase-card reveal">
                  <div className="phase-number">2</div>
                  <h3>{t.revealPhase}</h3>
                  <p>{t.revealPhaseDesc}</p>
                  <div className="phase-visual">
                    <code>commitments → decrypt → tally</code>
                  </div>
                </div>
              </div>
            </section>

            {/* Use Cases Section */}
            <section className="use-cases-section">
              <h2>{t.useCasesTitle}</h2>
              <div className="use-cases-grid">
                <div className="use-case-card">
                  <div className="use-case-icon">⚙️</div>
                  <h3>{t.useCase1Title}</h3>
                  <p>{t.useCase1Desc}</p>
                </div>
                <div className="use-case-card">
                  <div className="use-case-icon">💰</div>
                  <h3>{t.useCase2Title}</h3>
                  <p>{t.useCase2Desc}</p>
                </div>
                <div className="use-case-card">
                  <div className="use-case-icon">⚖️</div>
                  <h3>{t.useCase3Title}</h3>
                  <p>{t.useCase3Desc}</p>
                </div>
                <div className="use-case-card">
                  <div className="use-case-icon">🗳️</div>
                  <h3>{t.useCase4Title}</h3>
                  <p>{t.useCase4Desc}</p>
                </div>
              </div>
            </section>

            {/* Security Section */}
            <section className="security-section">
              <h2>{t.securityTitle}</h2>
              <div className="security-grid">
                <div className="security-card">
                  <div className="security-icon">💸</div>
                  <h3>{t.security1Title}</h3>
                  <p>{t.security1Desc}</p>
                </div>
                <div className="security-card">
                  <div className="security-icon">🔐</div>
                  <h3>{t.security2Title}</h3>
                  <p>{t.security2Desc}</p>
                </div>
                <div className="security-card">
                  <div className="security-icon">📸</div>
                  <h3>{t.security3Title}</h3>
                  <p>{t.security3Desc}</p>
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="faq-section">
              <h2>{t.faqTitle}</h2>
              <div className="faq-list">
                <div className="faq-item">
                  <h3>{t.faq1Q}</h3>
                  <p>{t.faq1A}</p>
                </div>
                <div className="faq-item">
                  <h3>{t.faq2Q}</h3>
                  <p>{t.faq2A}</p>
                </div>
                <div className="faq-item">
                  <h3>{t.faq3Q}</h3>
                  <p>{t.faq3A}</p>
                </div>
                <div className="faq-item">
                  <h3>{t.faq4Q}</h3>
                  <p>{t.faq4A}</p>
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
              <h2>{t.ctaTitle}</h2>
              <p>{t.ctaDesc}</p>
              <div className="cta-buttons">
                <button className="cta-btn" onClick={() => setCurrentPage('proposals')}>
                  {t.startDemo}
                </button>
                {!isConnected && (
                  <button className="cta-btn secondary" onClick={handleConnect}>
                    {t.connectWallet}
                  </button>
                )}
              </div>
              <p className="cta-note">{t.ctaNote}</p>
            </section>
          </div>
        )}

        {/* Proposals List Page */}
        {currentPage === 'proposals' && (
          <div className="proposals-page">
            <div className="page-header">
              <div className="page-title-section">
                <h1>{t.governanceProposals}</h1>
                <p className="page-subtitle">{t.governanceProposalsDesc}</p>
              </div>
              <div className="page-header-right">
                <div className="page-stats">
                  <div className="stat-item">
                    <span className="stat-value">{proposals.filter(p => p.status === 'active').length}</span>
                    <span className="stat-label">{t.inProgress}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{proposals.length}</span>
                    <span className="stat-label">{t.total}</span>
                  </div>
                </div>
                <button
                  className="create-proposal-btn"
                  onClick={() => setCurrentPage('create-proposal')}
                  disabled={!isConnected || votingPower < 100}
                  title={!isConnected ? t.connectWallet : votingPower < 100 ? t.minimumRequired : t.createProposal}
                >
                  {t.newProposal}
                </button>
              </div>
            </div>

            <div className="filter-bar">
              <button
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t.all}
              </button>
              <button
                className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                {t.active}
              </button>
              <button
                className={`filter-btn ${filter === 'closed' ? 'active' : ''}`}
                onClick={() => setFilter('closed')}
              >
                {t.closed}
              </button>
            </div>

            <div className="proposals-list">
              {filteredProposals.map(proposal => {
                const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes
                const forPercent = total > 0 ? (proposal.forVotes / total) * 100 : 0
                const againstPercent = total > 0 ? (proposal.againstVotes / total) * 100 : 0

                return (
                  <div
                    key={proposal.id}
                    className="proposal-card"
                    onClick={() => openProposal(proposal)}
                  >
                    <div className="proposal-card-header">
                      <div className="proposal-meta">
                        <span className="proposal-id">{proposal.id}</span>
                        <span className="proposal-category">{proposal.category}</span>
                      </div>
                      <div className="proposal-status-group">
                        {proposal.status === 'active' && (
                          <span className="proposal-countdown">⏱️ {getTimeRemaining(proposal.endTime)}</span>
                        )}
                        <span className={`proposal-status ${getStatusColor(proposal.status)}`}>
                          {getStatusLabel(proposal.status)}
                        </span>
                      </div>
                    </div>

                    <h3 className="proposal-title">{proposal.title}</h3>
                    <p className="proposal-description">{proposal.description}</p>

                    <div className="proposal-votes-bar">
                      <div className="votes-bar">
                        <div className="votes-for" style={{ width: `${forPercent}%` }}></div>
                        <div className="votes-against" style={{ width: `${againstPercent}%` }}></div>
                      </div>
                      <div className="votes-labels">
                        <span className="votes-for-label">
                          👍 {forPercent.toFixed(1)}% ({formatNumber(proposal.forVotes)})
                        </span>
                        <span className="votes-against-label">
                          👎 {againstPercent.toFixed(1)}% ({formatNumber(proposal.againstVotes)})
                        </span>
                      </div>
                    </div>

                    <div className="proposal-footer">
                      <span className="proposal-voters">👥 {proposal.totalVoters}{t.participants}</span>
                      <span className="proposal-end">
                        {proposal.status === 'active' ? `${t.deadline}: ${proposal.endTime.toLocaleDateString()}` : `${t.ended}: ${proposal.endTime.toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Proposal Detail Page */}
        {currentPage === 'proposal-detail' && selectedProposal && (
          <div className="proposal-detail-page">
            <button className="back-btn" onClick={() => setCurrentPage('proposals')}>
              {t.backToList}
            </button>

            <div className="proposal-detail-header">
              <div className="proposal-detail-meta">
                <span className="proposal-id">{selectedProposal.id}</span>
                <span className="proposal-category">{selectedProposal.category}</span>
                <span className={`proposal-status ${getStatusColor(selectedProposal.status)}`}>
                  {getStatusLabel(selectedProposal.status)}
                </span>
              </div>
              <h1 className="proposal-detail-title">{selectedProposal.title}</h1>
              <div className="proposal-author">
                {t.proposer}: <code>{selectedProposal.author}</code>
              </div>
            </div>

            <div className="proposal-detail-content">
              <div className="proposal-detail-main">
                <section className="detail-section">
                  <h2>{t.details}</h2>
                  <p>{selectedProposal.description}</p>
                </section>

                {/* Voting Section */}
                {selectedProposal.status === 'active' && (
                  <section className="voting-section">
                    <h2>{t.voting}</h2>

                    {/* Countdown */}
                    <div className="voting-countdown">
                      <span className="countdown-icon">⏱️</span>
                      <span className="countdown-text">{getTimeRemaining(selectedProposal.endTime)}</span>
                    </div>

                    {!isConnected ? (
                      <div className="connect-prompt">
                        <p>{t.connectToVote}</p>
                        <button className="connect-btn large" onClick={handleConnect}>
                          {t.connectWallet}
                        </button>
                      </div>
                    ) : votingPhase === 'select' ? (
                      <>
                        <div className="vote-options">
                          <button
                            className={`vote-option for ${selectedChoice === 'for' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('for')}
                          >
                            <span className="vote-icon">👍</span>
                            <span className="vote-label">{t.voteFor}</span>
                          </button>
                          <button
                            className={`vote-option against ${selectedChoice === 'against' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('against')}
                          >
                            <span className="vote-icon">👎</span>
                            <span className="vote-label">{t.voteAgainst}</span>
                          </button>
                          <button
                            className={`vote-option abstain ${selectedChoice === 'abstain' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('abstain')}
                          >
                            <span className="vote-icon">⏸️</span>
                            <span className="vote-label">{t.voteAbstain}</span>
                          </button>
                        </div>

                        <div className="zk-notice">
                          <span className="zk-icon">🔐</span>
                          <div className="zk-text">
                            <strong>{t.zkNotice}</strong>
                            <p>{t.zkNoticeDesc}</p>
                          </div>
                        </div>

                        <button
                          className="submit-vote-btn"
                          disabled={!selectedChoice}
                          onClick={startSealing}
                        >
                          {t.submitVote}
                        </button>
                      </>
                    ) : votingPhase === 'sealing' ? (
                      <div className="sealing-progress">
                        <div className="sealing-animation">
                          <div className="seal-icon">🔐</div>
                        </div>
                        <h3>{t.generatingProof}</h3>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${sealProgress}%` }}></div>
                        </div>
                        <p className="sealing-step">
                          {sealProgress < 30 && t.encryptingChoice}
                          {sealProgress >= 30 && sealProgress < 60 && t.generatingZK}
                          {sealProgress >= 60 && sealProgress < 90 && t.generatingCommitment}
                          {sealProgress >= 90 && t.submittingToChain}
                        </p>
                      </div>
                    ) : (
                      <div className="vote-submitted">
                        <div className="success-icon">✅</div>
                        <h3>{t.voteComplete}</h3>

                        <div className="commitment-display">
                          <span className="commitment-label">{t.commitmentRecorded}</span>
                          <code className="commitment-hash">{myCommitment}</code>
                        </div>

                        <div className="privacy-summary">
                          <div className="privacy-item">
                            <span className="privacy-label">👀 {t.othersCanSee}</span>
                            <code>{myCommitment}</code>
                          </div>
                          <div className="privacy-item secret">
                            <span className="privacy-label">🔐 {t.onlyYouKnow}</span>
                            <span className="privacy-value">
                              {selectedChoice === 'for' && `👍 ${t.voteFor}`}
                              {selectedChoice === 'against' && `👎 ${t.voteAgainst}`}
                              {selectedChoice === 'abstain' && `⏸️ ${t.voteAbstain}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {selectedProposal.status !== 'active' && (
                  <section className="voting-closed">
                    <h2>{t.votingClosed}</h2>
                    <p>{t.noMoreVotes}</p>
                    <div className="final-result">
                      <span className={`result-badge ${selectedProposal.status}`}>
                        {selectedProposal.status === 'passed' && '✅ 가결'}
                        {selectedProposal.status === 'defeated' && '❌ 부결'}
                      </span>
                    </div>
                  </section>
                )}
              </div>

              <div className="proposal-detail-sidebar">
                <div className="sidebar-card">
                  <h3>{t.currentResult}</h3>
                  <div className="results-breakdown">
                    {(() => {
                      const total = selectedProposal.forVotes + selectedProposal.againstVotes + selectedProposal.abstainVotes
                      const forPct = (selectedProposal.forVotes / total * 100).toFixed(1)
                      const againstPct = (selectedProposal.againstVotes / total * 100).toFixed(1)
                      const abstainPct = (selectedProposal.abstainVotes / total * 100).toFixed(1)
                      return (
                        <>
                          <div className="result-row">
                            <span className="result-label">👍 {t.voteFor}</span>
                            <div className="result-bar-container">
                              <div className="result-bar for" style={{ width: `${forPct}%` }}></div>
                            </div>
                            <span className="result-value">{forPct}%</span>
                          </div>
                          <div className="result-row">
                            <span className="result-label">👎 {t.voteAgainst}</span>
                            <div className="result-bar-container">
                              <div className="result-bar against" style={{ width: `${againstPct}%` }}></div>
                            </div>
                            <span className="result-value">{againstPct}%</span>
                          </div>
                          <div className="result-row">
                            <span className="result-label">⏸️ {t.voteAbstain}</span>
                            <div className="result-bar-container">
                              <div className="result-bar abstain" style={{ width: `${abstainPct}%` }}></div>
                            </div>
                            <span className="result-value">{abstainPct}%</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <div className="sidebar-card">
                  <h3>{t.info}</h3>
                  <div className="info-list">
                    <div className="info-row">
                      <span className="info-label">{t.participantCount}</span>
                      <span className="info-value">{selectedProposal.totalVoters}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">{t.totalVotes}</span>
                      <span className="info-value">
                        {formatNumber(selectedProposal.forVotes + selectedProposal.againstVotes + selectedProposal.abstainVotes)} TON
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">{selectedProposal.status === 'active' ? t.deadline : t.ended}</span>
                      <span className="info-value">{selectedProposal.endTime.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Proposal Page */}
        {currentPage === 'create-proposal' && (
          <div className="create-proposal-page">
            <button className="back-btn" onClick={() => setCurrentPage('proposals')}>
              {t.backToList}
            </button>

            <div className="page-header">
              <div className="page-title-section">
                <h1>{t.createProposal}</h1>
                <p className="page-subtitle">{t.createProposalDesc}</p>
              </div>
            </div>

            {!isConnected ? (
              <div className="connect-prompt-page">
                <div className="connect-prompt-icon">🔐</div>
                <h2>{t.connectWalletRequired}</h2>
                <p>{t.connectWalletToCreate}</p>
                <button className="connect-btn large" onClick={handleConnect}>
                  {t.connectWallet}
                </button>
              </div>
            ) : votingPower < 100 ? (
              <div className="connect-prompt-page">
                <div className="connect-prompt-icon">⚠️</div>
                <h2>{t.insufficientVotingPower}</h2>
                <p>{t.minimumRequired}</p>
                <p className="current-power">{t.currentHolding}: {votingPower} TON</p>
              </div>
            ) : (
              <div className="create-proposal-form">
                <div className="form-section">
                  <label>{t.title} *</label>
                  <input
                    type="text"
                    placeholder={t.titlePlaceholder}
                    value={newProposal.title}
                    onChange={(e) => setNewProposal(prev => ({ ...prev, title: e.target.value }))}
                    maxLength={100}
                  />
                  <span className="char-count">{newProposal.title.length}/100</span>
                </div>

                <div className="form-section">
                  <label>{t.category} *</label>
                  <select
                    value={newProposal.category}
                    onChange={(e) => setNewProposal(prev => ({ ...prev, category: e.target.value }))}
                  >
                    <option value={t.catGeneral}>{t.catGeneral}</option>
                    <option value={t.catTreasury}>{t.catTreasury}</option>
                    <option value={t.catProtocol}>{t.catProtocol}</option>
                    <option value={t.catValidator}>{t.catValidator}</option>
                    <option value={t.catSecurity}>{t.catSecurity}</option>
                    <option value={t.catMarketing}>{t.catMarketing}</option>
                    <option value={t.catPartnership}>{t.catPartnership}</option>
                  </select>
                </div>

                <div className="form-section">
                  <label>{t.votingPeriod} *</label>
                  <select
                    value={newProposal.duration}
                    onChange={(e) => setNewProposal(prev => ({ ...prev, duration: Number(e.target.value) }))}
                  >
                    <option value={3}>3{t.days}</option>
                    <option value={5}>5{t.days}</option>
                    <option value={7}>7{t.days} ({t.recommended})</option>
                    <option value={14}>14{t.days}</option>
                  </select>
                </div>

                <div className="form-section">
                  <label>{t.description} *</label>
                  <textarea
                    placeholder={t.descriptionPlaceholder}
                    value={newProposal.description}
                    onChange={(e) => setNewProposal(prev => ({ ...prev, description: e.target.value }))}
                    rows={12}
                  />
                  <span className="char-count">{newProposal.description.length}{t.characters}</span>
                </div>

                <div className="form-info">
                  <div className="info-item">
                    <span className="info-icon">ℹ️</span>
                    <div>
                      <strong>{t.proposalRequirements}</strong>
                      <p>{t.minimumHolding} ({t.currentHolding}: {votingPower} TON)</p>
                    </div>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">📊</span>
                    <div>
                      <strong>{t.quorum}</strong>
                      <p>{t.quorumDesc}</p>
                    </div>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">🔐</span>
                    <div>
                      <strong>{t.zkNotice}</strong>
                      <p>{t.zkEncrypted}</p>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    className="cancel-btn"
                    onClick={() => setCurrentPage('proposals')}
                  >
                    {t.cancel}
                  </button>
                  <button
                    className="submit-proposal-btn"
                    onClick={createProposal}
                    disabled={!newProposal.title || !newProposal.description}
                  >
                    {t.submitProposal}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* My Votes Page */}
        {currentPage === 'my-votes' && (
          <div className="my-votes-page">
            <div className="page-header">
              <div className="page-title-section">
                <h1>{t.myVotesTitle}</h1>
                <p className="page-subtitle">{t.myVotesDesc}</p>
              </div>
              {isConnected && (
                <div className="my-power">
                  <span className="my-power-label">{t.myVotingPower}</span>
                  <span className="my-power-value">{formatNumber(votingPower)} TON</span>
                </div>
              )}
            </div>

            {!isConnected ? (
              <div className="connect-prompt-page">
                <div className="connect-prompt-icon">🔐</div>
                <h2>{t.connectWalletRequired}</h2>
                <p>{t.connectToSeeVotes}</p>
                <button className="connect-btn large" onClick={handleConnect}>
                  {t.connectWallet}
                </button>
              </div>
            ) : myVotes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🗳️</div>
                <h2>{t.noVoteHistory}</h2>
                <p>{t.noVotesYet}</p>
                <button className="browse-btn" onClick={() => setCurrentPage('proposals')}>
                  {t.browseProposals}
                </button>
              </div>
            ) : (
              <div className="votes-list">
                {myVotes.map((vote, index) => (
                  <div key={index} className="vote-card">
                    <div className="vote-card-header">
                      <span className="vote-proposal-id">{vote.proposalId}</span>
                      <span className="vote-time">{vote.timestamp}</span>
                    </div>
                    <h3 className="vote-proposal-title">{vote.proposalTitle}</h3>
                    <div className="vote-details">
                      <div className="vote-choice-display">
                        <span className="vote-choice-icon">
                          {vote.choice === 'for' && '👍'}
                          {vote.choice === 'against' && '👎'}
                          {vote.choice === 'abstain' && '⏸️'}
                        </span>
                        <span className="vote-choice-text">
                          {vote.choice === 'for' && t.voteFor}
                          {vote.choice === 'against' && t.voteAgainst}
                          {vote.choice === 'abstain' && t.voteAbstain}
                        </span>
                      </div>
                      <div className="vote-power">{vote.votingPower} TON</div>
                    </div>
                    <div className="vote-commitment">
                      <span className="commitment-icon">🔒</span>
                      <code>{vote.commitment}</code>
                      <span className="commitment-note">{t.zkEncryptedNote}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <span>zkDEX D1 Private Voting Demo</span>
        </div>
        <div className="footer-links">
          <a href="https://www.tokamak.network/" target="_blank" rel="noopener noreferrer">Tokamak Network</a>
          <span className="footer-divider">•</span>
          <a href="https://github.com/tokamak-network" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  )
}

export default App
