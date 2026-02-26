/**
 * Config Loader - Environment-aware MACI configuration
 *
 * Supports two deployments:
 * - 'dev' (v2): depth=2, for testing and development
 * - 'prod': depth=4, maxVoters=624, production deployment
 *
 * Usage:
 *   import { getActiveConfig } from '@/lib/configLoader'
 *   const config = getActiveConfig()
 *   const maciAddress = config.addresses.maci
 */

import { config as rawConfig } from '../config';
import type { ChainConfig } from '../types/config';

export type CircuitMode = 'dev' | 'prod';

export interface ActiveConfig {
  mode: CircuitMode;
  addresses: {
    maci: `0x${string}`;
    accQueue: `0x${string}`;
    msgProcessorVerifier: `0x${string}`;
    tallyVerifier: `0x${string}`;
    vkRegistry: `0x${string}`;
    gatekeeper: `0x${string}`;
    voiceCreditProxy: `0x${string}`;
    token: `0x${string}`;
    delegationRegistry: `0x${string}`;
    delegatingVoiceCreditProxy: `0x${string}`;
    timelockExecutor: `0x${string}`;
  };
  coordinatorPubKey: {
    x: bigint;
    y: bigint;
  };
  params: {
    stateTreeDepth?: number;
    maxVoters?: number;
  };
  deployBlock: bigint;
  deployer: `0x${string}`;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

/**
 * Get the active circuit mode from environment variable
 * Defaults to 'dev' if not set or invalid
 */
export function getCircuitMode(): CircuitMode {
  if (typeof window !== 'undefined') {
    // Client-side: use NEXT_PUBLIC_ prefix
    const mode = process.env.NEXT_PUBLIC_CIRCUIT_MODE;
    return mode === 'prod' ? 'prod' : 'dev';
  }
  // Server-side: use CIRCUIT_MODE
  const mode = process.env.CIRCUIT_MODE;
  return mode === 'prod' ? 'prod' : 'dev';
}

/**
 * Get the config object for a specific mode
 */
function getConfigForMode(mode: CircuitMode): ChainConfig {
  if (mode === 'prod' && rawConfig.prod) {
    return rawConfig.prod;
  }
  // Default to v2 (dev)
  return rawConfig.v2 || {};
}

/**
 * Get the active configuration based on environment
 * This is the main export that components should use
 */
export function getActiveConfig(): ActiveConfig {
  const mode = getCircuitMode();
  const chainConfig = getConfigForMode(mode);

  return {
    mode,
    addresses: {
      maci: (chainConfig.maci || ZERO_ADDRESS) as `0x${string}`,
      accQueue: (chainConfig.accQueue || ZERO_ADDRESS) as `0x${string}`,
      msgProcessorVerifier: (chainConfig.msgProcessorVerifier || ZERO_ADDRESS) as `0x${string}`,
      tallyVerifier: (chainConfig.tallyVerifier || ZERO_ADDRESS) as `0x${string}`,
      vkRegistry: (chainConfig.vkRegistry || ZERO_ADDRESS) as `0x${string}`,
      gatekeeper: (chainConfig.gatekeeper || ZERO_ADDRESS) as `0x${string}`,
      voiceCreditProxy: (chainConfig.voiceCreditProxy || ZERO_ADDRESS) as `0x${string}`,
      token: (chainConfig.token || chainConfig.tonToken || ZERO_ADDRESS) as `0x${string}`,
      delegationRegistry: (chainConfig.delegationRegistry || ZERO_ADDRESS) as `0x${string}`,
      delegatingVoiceCreditProxy: (chainConfig.delegatingVoiceCreditProxy || ZERO_ADDRESS) as `0x${string}`,
      timelockExecutor: (chainConfig.timelockExecutor || ZERO_ADDRESS) as `0x${string}`,
    },
    coordinatorPubKey: {
      x: BigInt(chainConfig.coordinatorPubKeyX || '0'),
      y: BigInt(chainConfig.coordinatorPubKeyY || '0'),
    },
    params: {
      stateTreeDepth: chainConfig.stateTreeDepth,
      maxVoters: chainConfig.maxVoters,
    },
    deployBlock: BigInt(rawConfig.deployBlock || 0),
    deployer: (rawConfig.deployer || ZERO_ADDRESS) as `0x${string}`,
  };
}

/**
 * Legacy compatibility exports
 * These maintain backward compatibility with existing code that imports from contractV2
 */
const activeConfig = getActiveConfig();

export const MACI_V2_ADDRESS = activeConfig.addresses.maci;
export const MACI_DEPLOY_BLOCK = activeConfig.deployBlock;
export const TOKEN_ADDRESS = activeConfig.addresses.token;
export const DEPLOYER_ADDRESS = activeConfig.deployer;
export const VOICE_CREDIT_PROXY_ADDRESS = activeConfig.addresses.voiceCreditProxy;
export const MSG_PROCESSOR_VERIFIER_ADDRESS = activeConfig.addresses.msgProcessorVerifier;
export const TALLY_VERIFIER_ADDRESS = activeConfig.addresses.tallyVerifier;
export const VK_REGISTRY_ADDRESS = activeConfig.addresses.vkRegistry;
export const DEFAULT_COORD_PUB_KEY_X = activeConfig.coordinatorPubKey.x;
export const DEFAULT_COORD_PUB_KEY_Y = activeConfig.coordinatorPubKey.y;
export const DELEGATION_REGISTRY_ADDRESS = activeConfig.addresses.delegationRegistry;
export const TIMELOCK_EXECUTOR_ADDRESS = activeConfig.addresses.timelockExecutor;
