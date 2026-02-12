/**
 * Web Worker for ZK Proof Generation
 *
 * This worker runs proof generation in a separate thread to prevent UI freeze.
 * Communication via postMessage/onmessage.
 */

// Worker context
const ctx: Worker = self as unknown as Worker

// Message types
interface ProofRequest {
  type: 'generateProof'
  circuitInputs: Record<string, string | string[]>
  wasmUrl: string
  zkeyUrl: string
}

interface ProofResponse {
  type: 'proofComplete'
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
  }
  publicSignals: string[]
  duration: number
}

interface ProgressUpdate {
  type: 'progress'
  progress: number
  message: string
}

interface ErrorResponse {
  type: 'error'
  error: string
}

// Handle messages from main thread
ctx.onmessage = async (event: MessageEvent<ProofRequest>) => {
  const { type, circuitInputs, wasmUrl, zkeyUrl } = event.data

  if (type !== 'generateProof') {
    ctx.postMessage({ type: 'error', error: 'Unknown message type' } as ErrorResponse)
    return
  }

  try {
    // Progress: Loading snarkjs
    ctx.postMessage({
      type: 'progress',
      progress: 10,
      message: 'Loading snarkjs...'
    } as ProgressUpdate)

    // Dynamic import snarkjs
    const snarkjs = await import('snarkjs')

    // Progress: Loading circuit files
    ctx.postMessage({
      type: 'progress',
      progress: 30,
      message: 'Loading circuit files...'
    } as ProgressUpdate)

    // Progress: Generating proof
    ctx.postMessage({
      type: 'progress',
      progress: 50,
      message: 'Generating ZK proof... (please wait)'
    } as ProgressUpdate)

    const startTime = Date.now()

    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmUrl,
      zkeyUrl
    )

    const duration = Date.now() - startTime

    // Progress: Complete
    ctx.postMessage({
      type: 'progress',
      progress: 90,
      message: `Proof complete (${(duration / 1000).toFixed(1)}s)`
    } as ProgressUpdate)

    // Send result
    ctx.postMessage({
      type: 'proofComplete',
      proof,
      publicSignals,
      duration
    } as ProofResponse)

  } catch (error) {
    ctx.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error during proof generation'
    } as ErrorResponse)
  }
}

// Export for TypeScript
export {}
