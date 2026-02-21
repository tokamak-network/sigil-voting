import rawConfig from './config.json';
import type { ChainConfig, SigilConfig } from './types/config';

export const config = rawConfig as SigilConfig;

export function getNetwork(): string {
  return config.network || 'sepolia';
}

export function getChainConfig(network?: string): ChainConfig {
  const net = network || getNetwork();
  if (net === 'sepolia') return config.v2 || {};
  return config.prod || config.v2 || {};
}
