/**
 * sigil-sdk/widget — Embeddable voting widget (framework-agnostic)
 *
 * Renders a complete voting UI using pure DOM manipulation.
 * No React or other framework dependency required.
 *
 * Usage (HTML embed):
 *   <script type="module">
 *     import { mountSigilWidget } from 'sigil-sdk/widget';
 *     mountSigilWidget({
 *       maciAddress: '0x26428484F192D1dA677111A47615378Bc889d441',
 *       pollId: 0,
 *       target: '#vote-container',
 *     });
 *   </script>
 *
 * Usage (programmatic):
 *   const widget = mountSigilWidget({ maciAddress, pollId, target: '#app' });
 *   widget.unmount(); // cleanup
 */

import { ethers } from 'ethers';
import { SigilClient } from './client.js';
import type { PollResults, VoteChoice, PollStatus } from './types.js';
import { MemoryStorage } from './storage.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface WidgetConfig {
  /** MACI contract address */
  maciAddress: string;
  /** Poll ID to display */
  pollId: number;
  /** Target element ID (string) or HTMLElement */
  target?: string | HTMLElement;
  /** Ethereum chain ID (default: 11155111 = Sepolia) */
  chainId?: number;
  /** Theme: 'light' | 'dark' | 'auto' (default: 'auto') */
  theme?: 'light' | 'dark' | 'auto';
  /** Language: 'en' | 'ko' (default: 'en') */
  lang?: 'en' | 'ko';
  /** Ethers provider (if not using injected wallet) */
  provider?: ethers.Provider;
  /** Ethers signer (if not using injected wallet) */
  signer?: ethers.Signer;
  /** Callback when vote is submitted */
  onVote?: (receipt: { txHash: string; choice: string; numVotes: number }) => void;
  /** Callback when results are available */
  onResults?: (results: PollResults) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface WidgetHandle {
  /** Remove the widget from the DOM */
  unmount: () => void;
  /** Force refresh the widget state */
  refresh: () => Promise<void>;
}

// ─── Translations ────────────────────────────────────────────────────

const i18n = {
  en: {
    title: 'SIGIL Private Vote',
    connectWallet: 'Connect Wallet',
    connecting: 'Connecting...',
    walletConnected: 'Connected',
    voteFor: 'For',
    voteAgainst: 'Against',
    voteAbstain: 'Abstain',
    votes: 'votes',
    credits: 'credits',
    cost: 'Cost',
    castVote: 'Cast Vote',
    voting: 'Submitting vote...',
    voteCast: 'Vote submitted!',
    results: 'Results',
    forLabel: 'For',
    againstLabel: 'Against',
    abstainLabel: 'Abstain',
    totalVoters: 'Total Voters',
    pollActive: 'Voting Open',
    pollProcessing: 'Processing',
    pollFinalized: 'Finalized',
    pollMerging: 'Merging',
    noWallet: 'No Ethereum wallet detected',
    error: 'Error',
    retry: 'Retry',
    loading: 'Loading...',
    quadraticNote: 'Quadratic voting: cost = votes\u00B2',
    privacyNote: 'Your vote is permanently private (ZK)',
    antiCollusionNote: 'Protected by MACI anti-collusion',
    disconnect: 'Disconnect',
  },
  ko: {
    title: 'SIGIL \uBE44\uBC00\uD22C\uD45C',
    connectWallet: '\uC9C0\uAC11 \uC5F0\uACB0',
    connecting: '\uC5F0\uACB0 \uC911...',
    walletConnected: '\uC5F0\uACB0\uB428',
    voteFor: '\uCC2C\uC131',
    voteAgainst: '\uBC18\uB300',
    voteAbstain: '\uAE30\uAD8C',
    votes: '\uD45C',
    credits: '\uD06C\uB808\uB527',
    cost: '\uBE44\uC6A9',
    castVote: '\uD22C\uD45C\uD558\uAE30',
    voting: '\uD22C\uD45C \uC81C\uCD9C \uC911...',
    voteCast: '\uD22C\uD45C \uC644\uB8CC!',
    results: '\uACB0\uACFC',
    forLabel: '\uCC2C\uC131',
    againstLabel: '\uBC18\uB300',
    abstainLabel: '\uAE30\uAD8C',
    totalVoters: '\uCD1D \uD22C\uD45C\uC790',
    pollActive: '\uD22C\uD45C \uC911',
    pollProcessing: '\uC9D1\uACC4 \uC911',
    pollFinalized: '\uC644\uB8CC',
    pollMerging: '\uBCD1\uD569 \uC911',
    noWallet: '\uC774\uB354\uB9AC\uC6C0 \uC9C0\uAC11\uC774 \uAC10\uC9C0\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4',
    error: '\uC624\uB958',
    retry: '\uC7AC\uC2DC\uB3C4',
    loading: '\uB85C\uB529 \uC911...',
    quadraticNote: '\uC774\uCC28\uD22C\uD45C: \uBE44\uC6A9 = \uD45C\uC218\u00B2',
    privacyNote: '\uD22C\uD45C\uB294 \uC601\uAD6C\uC801\uC73C\uB85C \uBE44\uACF5\uAC1C (ZK)',
    antiCollusionNote: 'MACI \uB2F4\uD569\uBC29\uC9C0 \uBCF4\uD638',
    disconnect: '\uC5F0\uACB0 \uD574\uC81C',
  },
};

type Lang = keyof typeof i18n;
type TranslationKey = keyof typeof i18n.en;

// ─── Styles ──────────────────────────────────────────────────────────

function getStyles(isDark: boolean) {
  const bg = isDark ? '#1a1b23' : '#ffffff';
  const bgSecondary = isDark ? '#252630' : '#f5f5f7';
  const text = isDark ? '#e4e4e7' : '#18181b';
  const textMuted = isDark ? '#a1a1aa' : '#71717a';
  const border = isDark ? '#3f3f46' : '#e4e4e7';
  const accent = '#6366f1'; // Indigo
  const accentHover = '#4f46e5';
  const forColor = '#22c55e';
  const againstColor = '#ef4444';
  const abstainColor = '#a1a1aa';

  return {
    bg, bgSecondary, text, textMuted, border,
    accent, accentHover, forColor, againstColor, abstainColor,
  };
}

// ─── Widget Renderer ─────────────────────────────────────────────────

export function mountSigilWidget(config: WidgetConfig): WidgetHandle {
  const {
    maciAddress,
    pollId,
    chainId = 11155111,
    theme = 'auto',
    lang = 'en',
  } = config;

  const t = (key: TranslationKey) => i18n[lang as Lang]?.[key] ?? i18n.en[key];

  // Resolve target element
  let container: HTMLElement;
  if (typeof config.target === 'string') {
    const el = document.getElementById(config.target.replace('#', ''));
    if (!el) throw new Error(`Target element not found: ${config.target}`);
    container = el;
  } else if (config.target instanceof HTMLElement) {
    container = config.target;
  } else {
    container = document.createElement('div');
    document.body.appendChild(container);
  }

  // Theme
  const isDark = theme === 'dark' ||
    (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const s = getStyles(isDark);

  // State
  let client: SigilClient | null = null;
  let walletAddress: string | null = null;
  let pollStatus: PollStatus = 'active';
  let results: PollResults | null = null;
  let selectedChoice: VoteChoice = 'for';
  let numVotes = 1;
  let isLoading = false;
  let errorMsg: string | null = null;
  let successMsg: string | null = null;

  // ─── DOM Creation ──────────────────────────────────────────────

  const root = document.createElement('div');
  root.setAttribute('data-sigil-widget', 'true');
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    Object.assign(root.style, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: s.bg,
      color: s.text,
      borderRadius: '12px',
      border: `1px solid ${s.border}`,
      padding: '20px',
      maxWidth: '400px',
      boxSizing: 'border-box',
    });

    // Header
    const header = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '16px', paddingBottom: '12px', borderBottom: `1px solid ${s.border}`,
    });
    const titleEl = el('div', { fontSize: '16px', fontWeight: '600' });
    titleEl.textContent = t('title');
    const badge = statusBadge();
    header.appendChild(titleEl);
    header.appendChild(badge);
    root.appendChild(header);

    // Error message
    if (errorMsg) {
      const errBox = el('div', {
        background: '#fef2f2', color: '#dc2626', padding: '10px 12px',
        borderRadius: '8px', fontSize: '13px', marginBottom: '12px',
      });
      errBox.textContent = `${t('error')}: ${errorMsg}`;
      const retryBtn = el('button', {
        marginLeft: '8px', background: 'none', border: 'none',
        color: '#dc2626', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px',
      });
      retryBtn.textContent = t('retry');
      retryBtn.onclick = () => { errorMsg = null; refresh(); };
      errBox.appendChild(retryBtn);
      root.appendChild(errBox);
    }

    // Success message
    if (successMsg) {
      const succBox = el('div', {
        background: '#f0fdf4', color: '#16a34a', padding: '10px 12px',
        borderRadius: '8px', fontSize: '13px', marginBottom: '12px',
      });
      succBox.textContent = successMsg;
      root.appendChild(succBox);
      setTimeout(() => { successMsg = null; render(); }, 5000);
    }

    // Loading
    if (isLoading) {
      const loader = el('div', { textAlign: 'center', padding: '24px', color: s.textMuted });
      loader.textContent = t('loading');
      root.appendChild(loader);
      return;
    }

    // Wallet connection
    if (!walletAddress) {
      root.appendChild(renderWalletConnect());
      return;
    }

    // Connected address
    const addrBar = el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '12px', color: s.textMuted, marginBottom: '16px',
    });
    const addrText = el('span', {});
    addrText.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    addrBar.appendChild(addrText);
    root.appendChild(addrBar);

    // Poll content based on status
    if (pollStatus === 'finalized' && results) {
      root.appendChild(renderResults());
    } else if (pollStatus === 'active') {
      root.appendChild(renderVoteForm());
    } else {
      const procMsg = el('div', {
        textAlign: 'center', padding: '24px', color: s.textMuted, fontSize: '14px',
      });
      procMsg.textContent = pollStatus === 'processing' ? t('pollProcessing') : t('pollMerging');
      root.appendChild(procMsg);
    }

    // Footer
    const footer = el('div', {
      marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${s.border}`,
      fontSize: '11px', color: s.textMuted, textAlign: 'center',
    });
    const privSpan = document.createElement('span');
    privSpan.textContent = t('privacyNote');
    const dot = document.createTextNode(' \u00B7 ');
    const antiSpan = document.createElement('span');
    antiSpan.textContent = t('antiCollusionNote');
    footer.appendChild(privSpan);
    footer.appendChild(dot);
    footer.appendChild(antiSpan);
    root.appendChild(footer);
  }

  function statusBadge(): HTMLElement {
    const colors: Record<PollStatus, string> = {
      active: s.forColor,
      processing: '#f59e0b',
      finalized: s.accent,
      merging: '#f59e0b',
    };
    const labels: Record<PollStatus, TranslationKey> = {
      active: 'pollActive',
      processing: 'pollProcessing',
      finalized: 'pollFinalized',
      merging: 'pollMerging',
    };
    const badge = el('span', {
      fontSize: '11px', fontWeight: '500', padding: '2px 8px',
      borderRadius: '10px', background: `${colors[pollStatus]}20`,
      color: colors[pollStatus],
    });
    badge.textContent = t(labels[pollStatus]);
    return badge;
  }

  function renderWalletConnect(): HTMLElement {
    const wrapper = el('div', { textAlign: 'center', padding: '20px 0' });

    const icon = el('div', { fontSize: '40px', marginBottom: '12px' });
    icon.textContent = '\uD83D\uDD12';
    wrapper.appendChild(icon);

    const btn = el('button', {
      background: s.accent, color: '#fff', border: 'none',
      borderRadius: '8px', padding: '12px 24px', fontSize: '14px',
      fontWeight: '600', cursor: 'pointer', width: '100%',
    });
    btn.textContent = t('connectWallet');
    btn.onmouseenter = () => btn.style.background = s.accentHover;
    btn.onmouseleave = () => btn.style.background = s.accent;
    btn.onclick = connectWallet;
    wrapper.appendChild(btn);

    if (typeof window !== 'undefined' && !(window as any).ethereum) {
      const noWallet = el('p', { fontSize: '12px', color: s.textMuted, marginTop: '12px' });
      noWallet.textContent = t('noWallet');
      wrapper.appendChild(noWallet);
    }

    return wrapper;
  }

  function renderVoteForm(): HTMLElement {
    const form = el('div', {});

    // Choice buttons
    const choices: { key: VoteChoice; label: TranslationKey; color: string }[] = [
      { key: 'for', label: 'voteFor', color: s.forColor },
      { key: 'against', label: 'voteAgainst', color: s.againstColor },
      { key: 'abstain', label: 'voteAbstain', color: s.abstainColor },
    ];

    const choiceRow = el('div', { display: 'flex', gap: '8px', marginBottom: '16px' });
    for (const c of choices) {
      const isSelected = selectedChoice === c.key;
      const btn = el('button', {
        flex: '1', padding: '10px', border: `2px solid ${isSelected ? c.color : s.border}`,
        borderRadius: '8px', background: isSelected ? `${c.color}15` : 'transparent',
        color: isSelected ? c.color : s.text, fontSize: '13px', fontWeight: '600',
        cursor: 'pointer', transition: 'all 0.15s',
      });
      btn.textContent = t(c.label);
      btn.onclick = () => { selectedChoice = c.key; render(); };
      choiceRow.appendChild(btn);
    }
    form.appendChild(choiceRow);

    // Vote count
    const countSection = el('div', { marginBottom: '16px' });
    const countLabel = el('div', {
      display: 'flex', justifyContent: 'space-between', fontSize: '13px',
      marginBottom: '8px', color: s.textMuted,
    });
    const leftLabel = el('span', {});
    leftLabel.textContent = `${numVotes} ${t('votes')}`;
    const rightLabel = el('span', {});
    rightLabel.textContent = `${t('cost')}: ${numVotes * numVotes} ${t('credits')}`;
    countLabel.appendChild(leftLabel);
    countLabel.appendChild(rightLabel);
    countSection.appendChild(countLabel);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '10';
    slider.value = String(numVotes);
    Object.assign(slider.style, {
      width: '100%', accentColor: s.accent, cursor: 'pointer',
    });
    slider.oninput = () => { numVotes = Number(slider.value); render(); };
    countSection.appendChild(slider);

    const qNote = el('div', { fontSize: '11px', color: s.textMuted, marginTop: '4px' });
    qNote.textContent = t('quadraticNote');
    countSection.appendChild(qNote);
    form.appendChild(countSection);

    // Submit button
    const submitBtn = el('button', {
      width: '100%', padding: '12px', border: 'none', borderRadius: '8px',
      background: s.accent, color: '#fff', fontSize: '14px',
      fontWeight: '600', cursor: 'pointer',
    });
    submitBtn.textContent = t('castVote');
    submitBtn.onmouseenter = () => submitBtn.style.background = s.accentHover;
    submitBtn.onmouseleave = () => submitBtn.style.background = s.accent;
    submitBtn.onclick = submitVote;
    form.appendChild(submitBtn);

    return form;
  }

  function renderResults(): HTMLElement {
    if (!results) return el('div', {});

    const wrapper = el('div', {});
    const heading = el('div', { fontSize: '14px', fontWeight: '600', marginBottom: '12px' });
    heading.textContent = t('results');
    wrapper.appendChild(heading);

    const total = Number(results.forVotes + results.againstVotes + results.abstainVotes) || 1;

    const bars: { label: TranslationKey; value: bigint; color: string }[] = [
      { label: 'forLabel', value: results.forVotes, color: s.forColor },
      { label: 'againstLabel', value: results.againstVotes, color: s.againstColor },
      { label: 'abstainLabel', value: results.abstainVotes, color: s.abstainColor },
    ];

    for (const bar of bars) {
      const pct = (Number(bar.value) / total) * 100;
      const row = el('div', { marginBottom: '8px' });

      const labelRow = el('div', {
        display: 'flex', justifyContent: 'space-between',
        fontSize: '13px', marginBottom: '4px',
      });
      const nameEl = el('span', { color: bar.color, fontWeight: '500' });
      nameEl.textContent = t(bar.label);
      const valEl = el('span', { color: s.textMuted });
      valEl.textContent = `${bar.value} (${pct.toFixed(1)}%)`;
      labelRow.appendChild(nameEl);
      labelRow.appendChild(valEl);
      row.appendChild(labelRow);

      const barBg = el('div', {
        background: s.bgSecondary, borderRadius: '4px', height: '8px', overflow: 'hidden',
      });
      const barFill = el('div', {
        background: bar.color, height: '100%', borderRadius: '4px',
        width: `${pct}%`, transition: 'width 0.5s ease',
      });
      barBg.appendChild(barFill);
      row.appendChild(barBg);
      wrapper.appendChild(row);
    }

    const voterCount = el('div', {
      fontSize: '12px', color: s.textMuted, marginTop: '8px', textAlign: 'center',
    });
    voterCount.textContent = `${t('totalVoters')}: ${results.totalVoters}`;
    wrapper.appendChild(voterCount);

    return wrapper;
  }

  // ─── Actions ───────────────────────────────────────────────────

  async function connectWallet() {
    try {
      isLoading = true;
      render();

      let provider: ethers.Provider;
      let signer: ethers.Signer;

      if (config.signer && config.provider) {
        provider = config.provider;
        signer = config.signer;
      } else if (typeof window !== 'undefined' && (window as any).ethereum) {
        const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
        await browserProvider.send('eth_requestAccounts', []);

        // Switch to correct chain if needed
        try {
          await browserProvider.send('wallet_switchEthereumChain', [
            { chainId: `0x${chainId.toString(16)}` },
          ]);
        } catch {
          // Chain switch failed — continue anyway
        }

        provider = browserProvider;
        signer = await browserProvider.getSigner();
      } else {
        throw new Error(t('noWallet'));
      }

      walletAddress = await signer.getAddress();

      client = new SigilClient({
        maciAddress,
        provider,
        signer,
        storage: new MemoryStorage(),
      });

      await refresh();
    } catch (err) {
      errorMsg = (err as Error).message;
      isLoading = false;
      render();
      config.onError?.(err as Error);
    }
  }

  async function submitVote() {
    if (!client) return;

    try {
      isLoading = true;
      errorMsg = null;
      render();

      const receipt = await client.vote(pollId, selectedChoice, numVotes);

      successMsg = `${t('voteCast')} (tx: ${receipt.txHash.slice(0, 10)}...)`;
      isLoading = false;
      render();

      config.onVote?.({
        txHash: receipt.txHash,
        choice: selectedChoice,
        numVotes,
      });
    } catch (err) {
      errorMsg = (err as Error).message;
      isLoading = false;
      render();
      config.onError?.(err as Error);
    }
  }

  async function refresh() {
    if (!client) return;

    try {
      isLoading = true;
      render();

      const poll = await client.getPoll(pollId);
      if (poll) {
        pollStatus = poll.status;
      }

      if (pollStatus === 'finalized') {
        results = await client.getResults(pollId);
        config.onResults?.(results!);
      }

      isLoading = false;
      render();
    } catch (err) {
      errorMsg = (err as Error).message;
      isLoading = false;
      render();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  function el(tag: string, styles: Record<string, string>): HTMLElement {
    const element = document.createElement(tag);
    Object.assign(element.style, styles);
    return element;
  }

  // ─── Initial render ────────────────────────────────────────────

  // If provider/signer are pre-supplied, auto-connect
  if (config.signer && config.provider) {
    connectWallet();
  } else {
    render();
  }

  return {
    unmount: () => {
      root.remove();
    },
    refresh,
  };
}

/**
 * Auto-mount widgets from data attributes.
 *
 * Scans for elements with `data-sigil-maci` and `data-sigil-poll` attributes
 * and mounts widgets automatically.
 *
 * Usage:
 *   <div data-sigil-maci="0x..." data-sigil-poll="0" data-sigil-theme="dark"></div>
 *   <script type="module">
 *     import { autoMount } from 'sigil-sdk/widget';
 *     autoMount();
 *   </script>
 */
export function autoMount(): WidgetHandle[] {
  const elements = document.querySelectorAll<HTMLElement>('[data-sigil-maci]');
  const handles: WidgetHandle[] = [];

  for (const el of elements) {
    const maciAddress = el.dataset.sigilMaci;
    const pollId = Number(el.dataset.sigilPoll ?? '0');
    const theme = (el.dataset.sigilTheme ?? 'auto') as 'light' | 'dark' | 'auto';
    const lang = (el.dataset.sigilLang ?? 'en') as 'en' | 'ko';

    if (!maciAddress) continue;

    handles.push(mountSigilWidget({
      maciAddress,
      pollId,
      target: el,
      theme,
      lang,
    }));
  }

  return handles;
}
