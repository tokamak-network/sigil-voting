#!/bin/bash
# SIGIL Poll Status Checker — AI 토큰 0으로 상태 확인
# Usage: ./check-polls.sh
cd "$(dirname "$0")/coordinator" && node -e '
const { ethers } = require("ethers");
const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const MACI = "0x26428484F192D1dA677111A47615378Bc889d441";
const DEPLOY_BLOCK = 10297233;
const ABI = [
  "function nextPollId() view returns (uint256)",
  "event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)"
];
const POLL_ABI = ["function isVotingOpen() view returns (bool)", "function getDeployTimeAndDuration() view returns (uint256,uint256)"];
const TALLY_ABI = ["function tallyVerified() view returns (bool)"];

(async () => {
  const p = new ethers.JsonRpcProvider(RPC);
  const maci = new ethers.Contract(MACI, ABI, p);
  const n = Number(await maci.nextPollId());
  console.log(`\n=== SIGIL Poll Status (${n} polls) ===\n`);
  if (!n) return console.log("No polls.");

  // Chunked event query (50k block limit)
  const cur = await p.getBlockNumber();
  const map = {};
  for (let from = DEPLOY_BLOCK; from <= cur; from += 49000) {
    const to = Math.min(from + 48999, cur);
    const evts = await maci.queryFilter(maci.filters.DeployPoll(), from, to);
    for (const e of evts) map[Number(e.args.pollId)] = { poll: e.args.pollAddr, tally: e.args.tallyAddr };
  }

  let stuck = 0;
  for (let i = 0; i < n; i++) {
    const a = map[i];
    if (!a) { console.log(`Poll ${i}: ??? (event missing)`); continue; }
    const poll = new ethers.Contract(a.poll, POLL_ABI, p);
    const open = await poll.isVotingOpen();
    if (open) {
      const [dt, dur] = await poll.getDeployTimeAndDuration();
      const left = Math.max(0, Math.floor((Number(dt)+Number(dur) - Date.now()/1000) / 60));
      console.log(`Poll ${i}: 🗳  투표중 (${left}분 남음)`);
    } else {
      try {
        const v = await new ethers.Contract(a.tally, TALLY_ABI, p).tallyVerified();
        console.log(v ? `Poll ${i}: ✅ 완료` : `Poll ${i}: ⏳ 계산중 ← 확인 필요!`);
        if (!v) stuck++;
      } catch { console.log(`Poll ${i}: ⏳ 계산중 ← 확인 필요!`); stuck++; }
    }
  }
  console.log(stuck ? `\n⚠️  ${stuck}개 계산중 — gh run list --workflow=coordinator.yml -L1` : "\n✅ 모든 폴 정상");
})().catch(e => console.error("Error:", e.message));
'
