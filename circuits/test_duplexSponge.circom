pragma circom 2.1.6;

include "utils/duplexSponge.circom";

// Test circuit: decrypt 7 elements (matches MACI message format)
component main = PoseidonDuplexSpongeDecrypt(7);
