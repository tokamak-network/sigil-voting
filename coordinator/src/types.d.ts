declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>;
  export function buildBabyjub(): Promise<any>;
  export function buildEddsa(): Promise<any>;
}

declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, any>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{ proof: any; publicSignals: string[] }>;

    function verify(
      vkey: any,
      publicSignals: string[],
      proof: any,
    ): Promise<boolean>;
  }
}
