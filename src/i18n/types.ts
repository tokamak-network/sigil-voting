export type Language = 'ko' | 'en'

export interface Translations {
  header: {
    home: string
    vote: string
    connect: string
    connecting: string
    disconnect: string
    wrongNetwork: string
    switching: string
    balance: string
    newProposal: string
  }
  landing: {
    badge: string
    title: string
    subtitle: string
    enterApp: string
    heroStatus: string
    heroVersion: string
    zeroExposure: { title: string; desc: string }
    maciSecured: { title: string; desc: string }
    coreFeatures: string
    features: {
      privacy: { title: string; sub: string; desc: string }
      coercion: { title: string; sub: string; desc: string }
      fairness: { title: string; sub: string; desc: string }
      verified: { title: string; sub: string; desc: string }
    }
    operationalFlow: string
    lifecycle: {
      title: string
      label: string
      step1: { title: string; desc: string }
      step2: { title: string; desc: string }
      step3: { title: string; desc: string }
    }
    whyMaci: {
      title: string
      anti: { title: string; sub: string; desc: string }
      privacy: { title: string; sub: string; desc: string }
      verify: { title: string; sub: string; desc: string }
    }
    terminalAccess: string
    sourceCode: string
    documentation: string
    proofVerified: string
    cta: {
      title: string
      button: string
      step1: string
      step2: string
      step3: string
    }
  }
  maci: {
    title: string
    notDeployed: string
    notDeployedDesc: string
    notDeployedHint: string
    connectWallet: string
    description: string
    stepper: {
      createPoll: string
      vote: string
      result: string
    }
    stats: {
      registered: string
      currentPoll: string
      none: string
    }
    signup: {
      complete: string
      button: string
      desc: string
      loading: string
      error: string
      retry: string
    }
    poll: {
      active: string
    }
    vote: {
      title: string
    }
    results: {
      title: string
      desc: string
    }
    lastTx: string
    waiting: {
      merging: string
      processing: string
    }
  }
  createPoll: {
    title: string
    titleLabel: string
    titleMin: string
    titlePlaceholder: string
    descLabel: string
    descPlaceholder: string
    durationLabel: string
    durationHours: string
    durationHint: string
    submit: string
    submitting: string
    error: string
    errorOwner: string
    errorTokens: string
    checkingEligibility: string
    notEligible: string
    ownerOnly: string
    tokenRequired: string
    required: string
    yourBalance: string
    eligible: string
    success: string
    successDesc: string
    viewProposal: string
    close: string
    stageSubmitting: string
    stageConfirming: string
    stageWaiting: string
    enableCommunity: string
    enableCommunityDesc: string
    enabling: string
    gateEnabledSuccess: string
    draftPhase: string
    markdownSupported: string
    generateProposal: string
    guidelinesTitle: string
    stakingTitle: string
    stakingDesc: string
    privacyGuideTitle: string
    privacyGuideDesc: string
    windowTitle: string
    windowDesc: string
    quorumTitle: string
    quorumDesc: string
    networkOptimal: string
    networkOffline: string
    preset3d: string
    preset7d: string
    preset14d: string
    presetCustom: string
    hoursUnit: string
  }
  voteForm: {
    title: string
    desc: string
    against: string
    for: string
    weightLabel: string
    cost: string
    credits: string
    myCredits: string
    creditsTooltip: string
    weightTooltip: string
    creditExceeded: string
    costWarning: string
    submit: string
    submitting: string
    success: string
    error: string
    errorGas: string
    errorRejected: string
    stageRegistering: string
    stageEncrypting: string
    stageSigning: string
    stageConfirming: string
    stageWaiting: string
    stageDone: string
    processing: string
    patience: string
    successNext: string
    retry: string
    autoRegisterNotice: string
  }
  keyManager: {
    title: string
    expandLabel: string
    tooltip: string
    currentKey: string
    keyActive: string
    noKey: string
    noKeyReason: string
    changeKey: string
    warning: string
    confirm: string
    changing: string
    cancel: string
    success: string
    error: string
  }
  merging: {
    title: string
    desc: string
    stateQueue: string
    messageQueue: string
    merged: string
    pending: string
    allMerged: string
    elapsed: string
    estimate: string
    stuck: string
    stuckDesc: string
  }
  processing: {
    title: string
    desc: string
    step1: string
    step2: string
    step3: string
    inProgress: string
    complete: string
    waiting: string
    verified: string
    elapsed: string
    estimate: string
    stuck: string
    stuckDesc: string
  }
  results: {
    title: string
    desc: string
    passed: string
    rejected: string
    totalVoters: string
    totalVotes: string
    verified: string
    noVotes: string
    forLabel: string
    againstLabel: string
    creditsUnit: string
  }
  timer: {
    remaining: string
    ended: string
    hours: string
    minutes: string
    seconds: string
    tallyCountdown: string
  }
  confirm: {
    title: string
    choice: string
    weight: string
    cost: string
    notice: string
    submit: string
    cancel: string
  }
  proposals: {
    title: string
    loading: string
    empty: string
    emptyHint: string
    createNew: string
    status: {
      active: string
      ended: string
      finalized: string
    }
    messages: string
    backToList: string
    voted: string
    notVoted: string
    noFiltered: string
    filterAll: string
    filterVoting: string
    filterProcessing: string
    filterEnded: string
    daoGovernance: string
    subtitle: string
    participants: string
    calculating: string
    result: string
    statusVoting: string
    statusRevealing: string
    statusEnded: string
  }
  voteHistory: {
    alreadyVoted: string
    overrideWarning: string
    lastChoice: string
    lastWeight: string
    lastCost: string
    creditsRemaining: string
  }
  myVote: {
    title: string
    noVote: string
  }
  footer: {
    desc: string
    resources: string
    whitepaper: string
    audit: string
    sdk: string
    social: string
    copyright: string
    secured: string
    builtBy: string
    systemOperational: string
    protocolVersion: string
    node: string
  }
  proposalDetail: {
    currentStatus: string
    votingOpen: string
    proposalDesc: string
    totalParticipants: string
    users: string
    currentWeight: string
    alreadyVotedBanner: string
    reVote: string
    voteSubmitted: string
    receiptId: string
    yourSelection: string
    intensity: string
    totalCost: string
    changedMind: string
    encryptedProof: string
  }
  completedResults: {
    title: string
    votingBreakdown: string
    quadraticCredits: string
    finalTally: string
    uniqueAddresses: string
    quadraticMagnitude: string
    zkVerified: string
    viewOnExplorer: string
    proposalDetails: string
    titleLabel: string
    author: string
    description: string
    readFull: string
    defaultDesc: string
    votingStrategy: string
    shieldedVoting: string
  }
  voteSubmittedPage: {
    title: string
    txHash: string
    proposal: string
    myChoice: string
    votingStats: string
    intensity: string
    used: string
    votes: string
    viewOnExplorer: string
    txConfirmed: string
    returnToList: string
    privacyStatus: string
    maciShield: string
    proofs: string
    zkProofGenerated: string
  }
  voteFormExtra: {
    quadraticScaling: string
    minCredit: string
    maxCredits: string
  }
  technology: {
    nav: string
    title: string
    subtitle: string
    heroBadge: string
    zkVoting: {
      title: string
      badge: string
      desc: string
      howTitle: string
      howDesc: string
      point1: string
      point2: string
      point3: string
      commitLabel: string
      commitFormula: string
      proofValid: string
    }
    quadratic: {
      title: string
      badge: string
      desc: string
      howTitle: string
      howDesc: string
      example: string
      vote1: string
      vote2: string
      vote3: string
      creditUnit: string
      formula: string
    }
    antiCollusion: {
      title: string
      badge: string
      desc: string
      howTitle: string
      howDesc: string
      scenario: string
      step1: string
      step2: string
      step3: string
    }
    combined: {
      title: string
      desc: string
    }
    properties: {
      title: string
      subtitle: string
      collusion: { title: string; desc: string }
      receipt: { title: string; desc: string }
      privacy: { title: string; desc: string }
      uncensor: { title: string; desc: string }
      unforge: { title: string; desc: string }
      nonrepud: { title: string; desc: string }
      correct: { title: string; desc: string }
    }
    cta: {
      title: string
      button: string
    }
  }
}
