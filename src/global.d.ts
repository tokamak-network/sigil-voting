// CSS side-effect imports (noUncheckedSideEffectImports)
declare module '*.css' {}

// snarkjs has no official @types package
declare module 'snarkjs' {
  interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  interface ProveResult {
    proof: Groth16Proof;
    publicSignals: string[];
  }

  const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array,
      logger?: unknown
    ): Promise<ProveResult>;
    verify(
      verificationKey: unknown,
      publicSignals: string[],
      proof: Groth16Proof
    ): Promise<boolean>;
    exportSolidityCallData(proof: Groth16Proof, pub: string[]): Promise<string>;
  };
}
