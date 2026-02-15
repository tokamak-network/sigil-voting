pragma circom 2.1.6;

include "utils/duplexSponge.circom";

// Test circuit: decrypt 1 element
component main = PoseidonDuplexSpongeDecrypt(1);
