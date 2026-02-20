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
    resetData: string
    resetConfirm: string
    resetDone: string
    technology: string
    menu: string
    disconnectConfirm: string
    disconnectYes: string
    disconnectNo: string
    testnet: string
  }
  landing: {
    badge: string
    title: string
    subtitle: string
    enterApp: string
    heroStatus: string
    heroVersion: string
    heroLabel1: string
    heroLabel2: string
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
    optionA: string
    optionB: string
    whyMaci: {
      title: string
      anti: { title: string; sub: string; desc: string }
      privacy: { title: string; sub: string; desc: string }
      verify: { title: string; sub: string; desc: string }
    }
    terminalAccess: string
    connectDiscord: string
    sourceCode: string
    documentation: string
    proofVerified: string
    contactSales: string
    integration: {
      title: string
      subtitle: string
      step1Title: string
      step1Code: string
      step1Desc: string
      step2Title: string
      step2Code: string
      step2Desc: string
      step3Title: string
      step3Code: string
      step3Desc: string
      trustTitle: string
      trust1: string
      trust2: string
      trust3: string
      trust4: string
      comingSoon: string
    }
    stats: {
      testsCount: string
      testsLabel: string
      contractsCount: string
      contractsLabel: string
      propertiesCount: string
      propertiesLabel: string
      licenseCount: string
      licenseLabel: string
    }
    demo: {
      title: string
      subtitle: string
      placeholder: string
      note: string
      stepSubmit: string
      stepProof: string
      stepResult: string
      network: string
      comingSoon: string
    }
    established: string
    sdkIntegration: string
    comparison: {
      title: string
      subtitle: string
      feature: string
      permanentPrivacy: string
      antiBribery: string
      quadraticVoting: string
      onChainVerify: string
      automation: string
      erc20Support: string
      serverlessTally: string
      yes: string
      no: string
      partial: string
      plugin: string
      offchain: string
      demoStage: string
      ownChain: string
      postReveal: string
      postRevealDev: string
      native: string
      free: string
      selfHosted: string
      onlyStack: string
    }
    transparency: {
      title: string
      visibleTitle: string
      hiddenTitle: string
      visible1: string
      visible2: string
      visible3: string
      hidden1: string
      hidden2: string
      hidden3: string
      coordinatorNote: string
      coordinatorTitle: string
    }
    advantages: {
      title: string
      subtitle: string
      erc20: { title: string; desc: string }
      serverless: { title: string; desc: string }
      l2: { title: string; desc: string }
      tokenGate: { title: string; desc: string }
      widget: { title: string; desc: string }
      autoTally: { title: string; desc: string }
    }
    contracts: {
      title: string
      subtitle: string
      maci: string
      accQueue: string
      token: string
      viewOn: string
    }
    roadmap: {
      title: string
      subtitle: string
      phase1: { title: string; status: string }
      phase2: { title: string; status: string }
      phase3: { title: string; status: string }
      phase4: { title: string; status: string }
      phase5: { title: string; status: string }
      phase6: { title: string; status: string }
    }
    faq: {
      title: string
      subtitle: string
      q1: string; a1: string
      q2: string; a2: string
      q3: string; a3: string
      q4: string; a4: string
      q5: string; a5: string
      q6: string; a6: string
      q7: string; a7: string
      q8: string; a8: string
    }
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
    preset1m: string
    preset5m: string
    preset1h: string
    preset3d: string
    preset7d: string
    preset14d: string
    presetCustom: string
    hoursUnit: string
    minutesUnit: string
    noDescPlaceholder: string
    getTokens: string
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
    stageKeyChange: string
    processing: string
    patience: string
    successNext: string
    retry: string
    autoRegisterNotice: string
    estimatedGas: string
    yourEthBalance: string
    lowBalance: string
    firstVoteNote: string
    noCreditsTitle: string
    noCreditsDesc: string
    errorRejectedFriendly: string
    errorGasFriendly: string
    errorGeneric: string
    errorTimeout: string
    errorEncryption: string
    quadraticGuide: string
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
    stateQueueDesc: string
    messageQueueDesc: string
    timelineNote: string
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
    timelineNote: string
  }
  tallying: {
    banner: string
    phase: string
    proposalContext: string
    privacyAssurance: string
    zkEnvironment: string
    processingStatus: string
    step01: string
    step02: string
    currentPhase: string
    finalStep: string
    processing: string
    estimatedRemaining: string
    remaining: string
    myVoteSummary: string
    choice: string
    spent: string
    participation: string
    totalUsers: string
    privacyDesc: string
    systemOperational: string
    zkProofActive: string
    copyright: string
  }
  failed: {
    title: string
    desc: string
    reason: string
    newPollHint: string
    errorDetails: string
    processingError: string
    suggestedAction: string
    createNew: string
    statusFailed: string
    coordinatorHint: string
  }
  results: {
    title: string
    desc: string
    passed: string
    rejected: string
    tied: string
    totalVoters: string
    totalVotes: string
    verified: string
    noVotes: string
    noVotesYet: string
    allInvalid: string
    forLabel: string
    againstLabel: string
    creditsUnit: string
    retry: string
  }
  noVotes: {
    title: string
    desc: string
    status: string
  }
  timer: {
    remaining: string
    ended: string
    hours: string
    minutes: string
    seconds: string
    tallyCountdown: string
    processingHint: string
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
    emptyAction: string
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
    privacyFirst: string
    antiBribery: string
    verifiedTally: string
    terms: string
    privacy: string
    poweredBy: string
    coreInfra: string
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
    proposalPrefix: string
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
    contractLabel: string
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
      step1Title: string
      step2Title: string
      step3Title: string
      partnership: string
    }
    combined: {
      title: string
      desc: string
      diffTitle: string
      diff1: string
      diff2: string
      diff3: string
      diff4: string
      diff5: string
    }
    specs: {
      title: string
      subtitle: string
      proofTime: { label: string; value: string; desc: string }
      gasPerBatch: { label: string; value: string; desc: string }
      hashFunction: { label: string; value: string; desc: string }
      keyCurve: { label: string; value: string; desc: string }
      cipherSuite: { label: string; value: string; desc: string }
      treeDepth: { label: string; value: string; desc: string }
      msgConstraints: { label: string; value: string; desc: string }
      tallyConstraints: { label: string; value: string; desc: string }
      ptau: { label: string; value: string; desc: string }
    }
    architecture: {
      title: string
      subtitle: string
      step1: { title: string; desc: string }
      step2: { title: string; desc: string }
      step3: { title: string; desc: string }
      step4: { title: string; desc: string }
    }
    pipeline: {
      title: string
      subtitle: string
      total: string
      step1: { title: string; desc: string; time: string }
      step2: { title: string; desc: string; time: string }
      step3: { title: string; desc: string; time: string }
      step4: { title: string; desc: string; time: string }
      note: string
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
    developers: {
      title: string
      subtitle: string
      sdkTitle: string
      sdkDesc: string
      sdkCode: string
      widgetTitle: string
      widgetDesc: string
      widgetCode: string
      apiTitle: string
      apiDesc: string
      apiCode: string
      useCaseTitle: string
      useCase1: string
      useCase2: string
      useCase3: string
      useCase4: string
      trustTitle: string
      trust1: string
      trust2: string
      trust3: string
      trust4: string
      protocolStack: string
    }
    infrastructure: {
      title: string
      subtitle: string
      serverless: { title: string; desc: string }
      erc20: { title: string; desc: string }
      l2: { title: string; desc: string }
      tokenGate: { title: string; desc: string }
      autoTally: { title: string; desc: string }
      customServer: { title: string; desc: string }
    }
    cta: {
      title: string
      button: string
    }
  }
}
