export interface ChainConfig {
  maci?: `0x${string}`;
  accQueue?: `0x${string}`;
  msgProcessorVerifier?: `0x${string}`;
  tallyVerifier?: `0x${string}`;
  vkRegistry?: `0x${string}`;
  gatekeeper?: `0x${string}`;
  voiceCreditProxy?: `0x${string}`;
  token?: `0x${string}`;
  tonToken?: `0x${string}`;
  coordinatorPubKeyX?: string;
  coordinatorPubKeyY?: string;
  stateTreeDepth?: number;
  maxVoters?: number;
  delegationRegistry?: `0x${string}`;
  delegatingVoiceCreditProxy?: `0x${string}`;
  timelockExecutor?: `0x${string}`;
}

export interface SigilConfig {
  network?: string;
  v2?: ChainConfig;
  prod?: ChainConfig;
  deployBlock?: number;
  deployedAt?: string;
  deployer?: `0x${string}`;
}
