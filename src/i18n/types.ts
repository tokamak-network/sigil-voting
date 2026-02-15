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
  }
  landing: {
    badge: string
    title: string
    subtitle: string
    enterApp: string
    features: {
      privacy: { title: string; desc: string }
      coercion: { title: string; desc: string }
      fairness: { title: string; desc: string }
      verified: { title: string; desc: string }
    }
    lifecycle: {
      title: string
      label: string
      step1: { title: string; desc: string }
      step2: { title: string; desc: string }
      step3: { title: string; desc: string }
    }
    whyMaci: {
      title: string
      anti: { title: string; desc: string }
      privacy: { title: string; desc: string }
      verify: { title: string; desc: string }
    }
    cta: {
      title: string
      button: string
      step1: string
      step2: string
      step3: string
    }
    heroVersion: string
  }
  maci: {
    title: string
    notDeployed: string
    notDeployedDesc: string
    notDeployedHint: string
    connectWallet: string
    description: string
    stepper: {
      register: string
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
      loading: string
      error: string
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
    creditExceeded: string
    costWarning: string
    submit: string
    submitting: string
    success: string
    error: string
    errorGas: string
    errorRejected: string
    stageEncrypting: string
    stageSigning: string
    stageConfirming: string
    stageWaiting: string
    stageDone: string
    processing: string
    patience: string
  }
  keyManager: {
    title: string
    expandLabel: string
    tooltip: string
    currentKey: string
    noKey: string
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
  }
  results: {
    title: string
    desc: string
    passed: string
    rejected: string
    totalVoters: string
    totalVotes: string
    verified: string
  }
  timer: {
    remaining: string
    ended: string
    hours: string
    minutes: string
    seconds: string
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
    empty: string
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
  }
  voteHistory: {
    alreadyVoted: string
    overrideWarning: string
    lastChoice: string
    lastWeight: string
    lastCost: string
    creditsRemaining: string
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
  }
}
