pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";

// Test circuit for EdDSA-Poseidon signature verification
template TestEddsaVerify() {
    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;
    signal input M;

    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.Ax <== Ax;
    verifier.Ay <== Ay;
    verifier.S <== S;
    verifier.R8x <== R8x;
    verifier.R8y <== R8y;
    verifier.M <== M;
}

component main = TestEddsaVerify();
