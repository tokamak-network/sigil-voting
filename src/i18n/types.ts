export type Language = 'ko' | 'en'

export interface Translations {
  header: {
    vote: string
    connect: string
    connecting: string
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
    qv: {
      title: string
      desc: string
      metric: string
      regular: string
      quadratic: string
      tokenCost: string
      votingPower: string
      totalStrength: string
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
    modeD1: string
    modeD2: string
    modeD1Desc: string
    modeD2Desc: string
    stats: {
      registered: string
      currentPoll: string
      phase: string
      none: string
    }
    signup: {
      title: string
      complete: string
      button: string
      loading: string
    }
    poll: {
      title: string
      active: string
      button: string
      loading: string
    }
    vote: {
      title: string
    }
    results: {
      title: string
      desc: string
    }
    lastTx: string
  }
  voteForm: {
    title: string
    desc: string
    against: string
    for: string
    abstain: string
    weightLabel: string
    cost: string
    credits: string
    submit: string
    submitting: string
    success: string
    error: string
  }
  keyManager: {
    title: string
    currentKey: string
    noKey: string
    changeKey: string
    warning: string
    confirm: string
    changing: string
    cancel: string
    success: string
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
