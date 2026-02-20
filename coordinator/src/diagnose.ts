#!/usr/bin/env tsx
/**
 * Diagnostic script: decrypt and inspect Poll messages
 * Usage: cd coordinator && npx tsx src/diagnose.ts <pollId>
 */
import { ethers } from 'ethers';
import { loadConfig, initCrypto, MACI_ABI, POLL_ABI, TALLY_ABI } from './run.js';

const pollId = parseInt(process.argv[2] || '6');

async function main() {
  console.log(`\n=== DIAGNOSING POLL ${pollId} ===\n`);

  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const crypto = await initCrypto();

  const maci = new ethers.Contract(config.maciAddress, MACI_ABI, provider);

  // Find poll addresses
  const deployEvents = await maci.queryFilter(maci.filters.DeployPoll(), config.deployBlock);
  const ev = deployEvents.find((e: any) => Number(e.args.pollId) === pollId);
  if (!ev || !('args' in ev)) { console.log('Poll not found'); return; }
  const args = ev.args as any;
  const pollAddr = args.pollAddr;
  const tallyAddr = args.tallyAddr;

  console.log(`Poll contract: ${pollAddr}`);
  console.log(`Tally contract: ${tallyAddr}`);

  const poll = new ethers.Contract(pollAddr, POLL_ABI, provider);
  const tally = new ethers.Contract(tallyAddr, TALLY_ABI, provider);

  const isOpen = await poll.isVotingOpen();
  const numMsgs = await poll.numMessages();
  const coordX = await poll.coordinatorPubKeyX();
  const coordY = await poll.coordinatorPubKeyY();

  console.log(`isVotingOpen: ${isOpen}`);
  console.log(`numMessages: ${numMsgs}`);
  console.log(`coordinatorPubKey: [${coordX}, ${coordY}]`);

  try {
    console.log(`tallyVerified: ${await tally.tallyVerified()}`);
    console.log(`forVotes: ${await tally.forVotes()}`);
    console.log(`againstVotes: ${await tally.againstVotes()}`);
    console.log(`totalVoters: ${await tally.totalVoters()}`);
  } catch { console.log('Tally not yet available'); }

  // Fetch signups
  const signUpFilter = maci.filters.SignUp();
  const signUpEvents = await maci.queryFilter(signUpFilter, config.deployBlock);
  console.log(`\n--- ${signUpEvents.length} SignUp events ---`);
  for (const se of signUpEvents) {
    if ('args' in se) {
      const a = se.args as any;
      const tx = await provider.getTransaction(se.transactionHash);
      console.log(`  stateIdx=${a.stateIndex} from=${tx?.from} pubKey=[${a.pubKeyX.toString().slice(0,20)}..., ${a.pubKeyY.toString().slice(0,20)}...] credits=${a.voiceCreditBalance}`);
    }
  }

  // Fetch messages
  const msgFilter = poll.filters.MessagePublished();
  const msgEvents = await poll.queryFilter(msgFilter, config.deployBlock);
  console.log(`\n--- ${msgEvents.length} MessagePublished events ---`);

  for (const me of msgEvents) {
    if (!('args' in me)) continue;
    const a = me.args as any;
    const msgIdx = Number(a.messageIndex);
    const encPubKeyX = BigInt(a.encPubKeyX);
    const encPubKeyY = BigInt(a.encPubKeyY);
    const data = a.encMessage.map((x: any) => BigInt(x));

    const isPadding = encPubKeyX === 0n && encPubKeyY === 0n;
    const voteTx = await provider.getTransaction(me.transactionHash);
    console.log(`\n  Message ${msgIdx}: from=${voteTx?.from} encPubKey=[${encPubKeyX.toString().slice(0,15)}..., ${encPubKeyY.toString().slice(0,15)}...]${isPadding ? ' (PADDING)' : ''}`);

    if (isPadding) { console.log('    → Padding message, skip'); continue; }

    // Decrypt
    const sharedKey = crypto.ecdh(config.coordinatorSk, [encPubKeyX, encPubKeyY]);
    console.log(`    sharedKey: [${sharedKey[0].toString().slice(0,20)}..., ${sharedKey[1].toString().slice(0,20)}...]`);

    const plaintext = crypto.decrypt(data, sharedKey, 0n);
    if (!plaintext) {
      console.log('    ✗ DECRYPTION FAILED (auth tag mismatch)');
      continue;
    }
    console.log('    ✓ Decryption OK');

    // Unpack command
    const cmd = crypto.unpackCommand(plaintext[0]);
    cmd.newPubKeyX = plaintext[1];
    cmd.newPubKeyY = plaintext[2];
    cmd.salt = plaintext[3];

    const sig = {
      R8: [plaintext[4], plaintext[5]],
      S: plaintext[6],
    };

    console.log(`    cmd: stateIndex=${cmd.stateIndex} voteOptionIndex=${cmd.voteOptionIndex} weight=${cmd.newVoteWeight} nonce=${cmd.nonce} pollId=${cmd.pollId}`);
    console.log(`    newPubKey: [${cmd.newPubKeyX.toString().slice(0,20)}..., ${cmd.newPubKeyY.toString().slice(0,20)}...]`);

    // Find state leaf for this voter
    const stateIdx = Number(cmd.stateIndex);
    if (stateIdx > 0 && stateIdx <= signUpEvents.length) {
      const voterEvent = signUpEvents.find((e: any) => Number(e.args.stateIndex) === stateIdx);
      if (voterEvent && 'args' in voterEvent) {
        const va = voterEvent.args as any;
        const registeredPubKey = [BigInt(va.pubKeyX), BigInt(va.pubKeyY)];
        console.log(`    registeredPubKey: [${registeredPubKey[0].toString().slice(0,20)}..., ${registeredPubKey[1].toString().slice(0,20)}...]`);

        // Verify signature
        const cmdHash = crypto.hashCommand(cmd);
        const sigOk = crypto.verifyEdDSA(cmdHash, sig, registeredPubKey);
        console.log(`    cmdHash: ${cmdHash.toString().slice(0,30)}...`);
        console.log(`    signature valid: ${sigOk}`);

        if (!sigOk) {
          console.log('    ✗ SIGNATURE CHECK FAILED against registeredPubKey');
          // Also try verifying against newPubKey
          const newPubKey = [cmd.newPubKeyX, cmd.newPubKeyY];
          const sigOkNew = crypto.verifyEdDSA(cmdHash, sig, newPubKey);
          console.log(`    signature valid against newPubKey: ${sigOkNew}`);
          if (sigOkNew) {
            console.log('    → Voter signed with newPubKey, NOT the registered key!');
            console.log('    → This means the frontend is using a different key than what was registered on-chain');
          } else {
            console.log('    → Signature fails against BOTH keys — possible data corruption or wrong coordinator key');
          }
        }
      } else {
        console.log(`    ✗ No SignUp event for stateIndex=${stateIdx}`);
      }
    } else {
      console.log(`    ✗ stateIndex=${stateIdx} out of range`);
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
