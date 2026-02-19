pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/compconstant.circom";
include "circomlib/circuits/comparators.circom";

/**
 * EdDSAPoseidonVerifierSoft
 *
 * Same computation as circomlib's EdDSAPoseidonVerifier but returns
 * a boolean `valid` signal instead of asserting via ForceEqualIfEnabled.
 *
 * This allows the MessageProcessor circuit to treat messages with
 * invalid signatures as no-ops (route to index 0) rather than
 * failing the entire proof generation.
 *
 * Output:
 *   valid = 1 if enabled=1 AND signature is correct
 *   valid = 0 otherwise (disabled OR invalid signature)
 */
template EdDSAPoseidonVerifierSoft() {
    signal input enabled;
    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;
    signal input M;

    signal output valid;

    var i;

    // ---- 1. Check S < Subgroup Order ----
    component snum2bits = Num2Bits(253);
    snum2bits.in <== S;

    component compConstant = CompConstant(
        2736030358979909402780800718157159386076813972158567259200215660948447373040
    );
    for (i = 0; i < 253; i++) {
        snum2bits.out[i] ==> compConstant.in[i];
    }
    compConstant.in[253] <== 0;

    // Soft: sInRange = 1 if S < l (subgroup order), 0 if S >= l
    // compConstant.out = 1 when input > constant, so invert
    signal sInRange;
    sInRange <== 1 - compConstant.out;

    // ---- 2. Compute h = Poseidon(R8x, R8y, Ax, Ay, M) ----
    component hash = Poseidon(5);
    hash.inputs[0] <== R8x;
    hash.inputs[1] <== R8y;
    hash.inputs[2] <== Ax;
    hash.inputs[3] <== Ay;
    hash.inputs[4] <== M;

    component h2bits = Num2Bits_strict();
    h2bits.in <== hash.out;

    // ---- 3. Compute right2 = h * 8 * A ----
    // Multiply A by 8 via three doublings (ensures subgroup membership)
    component dbl1 = BabyDbl();
    dbl1.x <== Ax;
    dbl1.y <== Ay;

    component dbl2 = BabyDbl();
    dbl2.x <== dbl1.xout;
    dbl2.y <== dbl1.yout;

    component dbl3 = BabyDbl();
    dbl3.x <== dbl2.xout;
    dbl3.y <== dbl2.yout;

    // Soft: check A is not zero point
    component isZero = IsZero();
    isZero.in <== dbl3.x;
    signal aNotZero;
    aNotZero <== 1 - isZero.out;

    // h * (8*A)
    component mulAny = EscalarMulAny(254);
    for (i = 0; i < 254; i++) {
        mulAny.e[i] <== h2bits.out[i];
    }
    mulAny.p[0] <== dbl3.xout;
    mulAny.p[1] <== dbl3.yout;

    // ---- 4. Compute right = R8 + h*8*A ----
    component addRight = BabyAdd();
    addRight.x1 <== R8x;
    addRight.y1 <== R8y;
    addRight.x2 <== mulAny.out[0];
    addRight.y2 <== mulAny.out[1];

    // ---- 5. Compute left = S * B8 ----
    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
    component mulFix = EscalarMulFix(253, BASE8);
    for (i = 0; i < 253; i++) {
        mulFix.e[i] <== snum2bits.out[i];
    }

    // ---- 6. Soft equality: left == right ? ----
    component eqX = IsEqual();
    eqX.in[0] <== mulFix.out[0];
    eqX.in[1] <== addRight.xout;

    component eqY = IsEqual();
    eqY.in[0] <== mulFix.out[1];
    eqY.in[1] <== addRight.yout;

    // ---- 7. Combine all checks ----
    // valid = enabled AND sInRange AND aNotZero AND eqX AND eqY
    signal sigMatch;
    sigMatch <== eqX.out * eqY.out;

    signal rangeAndNotZero;
    rangeAndNotZero <== sInRange * aNotZero;

    signal allChecks;
    allChecks <== sigMatch * rangeAndNotZero;

    valid <== allChecks * enabled;
}
