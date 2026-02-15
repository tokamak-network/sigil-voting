pragma circom 2.1.6;

include "utils/duplexSponge.circom";

// Test circuit: decrypt 3 elements (exact block)
component main = PoseidonDuplexSpongeDecrypt(3);
