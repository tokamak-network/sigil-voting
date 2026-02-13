/**
 * On-chain Event Listener
 *
 * Listens for MACI contract events and synchronizes off-chain state.
 * Events: SignUp, MessagePublished, PollDeployed
 */

import { ethers } from 'ethers';
import type { QuinaryMerkleTree } from '../trees/quinaryTree.js';
import type { EncryptedMessage } from '../processing/processMessages.js';

export interface ListenerConfig {
  provider: ethers.Provider;
  maciAddress: string;
  pollAddress: string;
  maciAbi: ethers.InterfaceAbi;
  pollAbi: ethers.InterfaceAbi;
}

export interface OnchainState {
  stateLeaves: Map<number, bigint>;  // stateIndex → stateLeafHash
  messages: EncryptedMessage[];
  numSignUps: number;
}

export class EventListener {
  private maciContract: ethers.Contract;
  private pollContract: ethers.Contract;
  private state: OnchainState;

  constructor(config: ListenerConfig) {
    this.maciContract = new ethers.Contract(config.maciAddress, config.maciAbi, config.provider);
    this.pollContract = new ethers.Contract(config.pollAddress, config.pollAbi, config.provider);
    this.state = {
      stateLeaves: new Map(),
      messages: [],
      numSignUps: 0,
    };
  }

  async startListening(): Promise<void> {
    // Listen for SignUp events
    this.maciContract.on('SignUp', (stateIndex: bigint, pubKeyX: bigint, pubKeyY: bigint, voiceCredits: bigint) => {
      this.state.stateLeaves.set(Number(stateIndex), 0n); // Will be computed
      this.state.numSignUps++;
    });

    // Listen for MessagePublished events
    this.pollContract.on('MessagePublished', (messageIndex: bigint, encMessage: bigint[], encPubKeyX: bigint, encPubKeyY: bigint) => {
      this.state.messages.push({
        data: encMessage.map((v) => BigInt(v)),
        encPubKeyX: BigInt(encPubKeyX),
        encPubKeyY: BigInt(encPubKeyY),
        messageIndex: Number(messageIndex),
      });
    });
  }

  stopListening(): void {
    this.maciContract.removeAllListeners();
    this.pollContract.removeAllListeners();
  }

  getState(): OnchainState {
    return this.state;
  }

  async fetchPastEvents(): Promise<void> {
    // Fetch past SignUp events
    const signUpFilter = this.maciContract.filters.SignUp();
    const signUpEvents = await this.maciContract.queryFilter(signUpFilter);

    for (const event of signUpEvents) {
      if ('args' in event) {
        const args = event.args as any;
        this.state.stateLeaves.set(Number(args.stateIndex), 0n);
        this.state.numSignUps++;
      }
    }

    // Fetch past MessagePublished events
    const msgFilter = this.pollContract.filters.MessagePublished();
    const msgEvents = await this.pollContract.queryFilter(msgFilter);

    for (const event of msgEvents) {
      if ('args' in event) {
        const args = event.args as any;
        this.state.messages.push({
          data: args.encMessage.map((v: bigint) => BigInt(v)),
          encPubKeyX: BigInt(args.encPubKeyX),
          encPubKeyY: BigInt(args.encPubKeyY),
          messageIndex: Number(args.messageIndex),
        });
      }
    }
  }
}
