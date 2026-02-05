const { buildPoseidon } = require("circomlibjs");
const { buildBabyjub } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const babyJub = await buildBabyjub();
  const F = poseidon.F;

  // Secret key (small for testing)
  const sk = BigInt(12345);

  // Derive public key using Baby Jubjub
  const pkPoint = babyJub.mulPointEscalar(babyJub.Base8, sk);
  const pkX = F.toObject(pkPoint[0]);
  const pkY = F.toObject(pkPoint[1]);

  // Token note parameters
  const noteValue = BigInt(100);
  const noteSalt = BigInt(999);
  const tokenType = BigInt(1);

  // Compute noteHash = Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)
  const noteHashInputs = [pkX, pkY, noteValue, tokenType, noteSalt];
  const noteHash = F.toObject(poseidon(noteHashInputs));

  // For simple test: merkle tree with single leaf = noteHash, all siblings = 0
  // MerkleRoot = hash(hash(hash(...hash(noteHash, 0), 0), 0)..., 0)
  let currentHash = noteHash;
  const merklePath = [];
  for (let i = 0; i < 20; i++) {
    merklePath.push("0");
    const leftRight = [currentHash, BigInt(0)];
    currentHash = F.toObject(poseidon(leftRight));
  }
  const merkleRoot = currentHash;

  // Vote parameters
  const proposalId = BigInt(1);
  const votingPower = noteValue; // Must match
  const choice = BigInt(1); // FOR
  const voteSalt = BigInt(888);

  // Compute voteCommitment = Poseidon(choice, votingPower, proposalId, voteSalt)
  const commitmentInputs = [choice, votingPower, proposalId, voteSalt];
  const voteCommitment = F.toObject(poseidon(commitmentInputs));

  // Create input JSON
  const input = {
    voteCommitment: voteCommitment.toString(),
    proposalId: proposalId.toString(),
    votingPower: votingPower.toString(),
    merkleRoot: merkleRoot.toString(),
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString(),
    noteHash: noteHash.toString(),
    noteValue: noteValue.toString(),
    noteSalt: noteSalt.toString(),
    tokenType: tokenType.toString(),
    choice: choice.toString(),
    voteSalt: voteSalt.toString(),
    merklePath: merklePath,
    merkleIndex: "0"
  };

  console.log(JSON.stringify(input, null, 2));
}

main().catch(console.error);
