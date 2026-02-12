/**
 * Web Worker Helper for ZK Proof Generation
 *
 * Wraps the worker communication in a Promise-based API.
 * Falls back to main thread if worker fails.
 */

import ZkProofWorker from './zkProofWorker?worker'

export interface ProofResult {
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
  }
  publicSignals: string[]
  duration: number
}

export interface ProofProgressCallback {
  (progress: number, message: string): void
}

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new ZkProofWorker()
  }
  return workerInstance
}

/**
 * Generate ZK proof using Web Worker
 */
export async function generateProofInWorker(
  circuitInputs: Record<string, string | string[]>,
  wasmUrl: string,
  zkeyUrl: string,
  onProgress?: ProofProgressCallback
): Promise<ProofResult> {
  return new Promise((resolve, reject) => {
    try {
      const worker = getWorker()

      const timeout = setTimeout(() => {
        reject(new Error('Proof generation timeout (120s)'))
      }, 120000)

      worker.onmessage = (event) => {
        const data = event.data

        switch (data.type) {
          case 'progress':
            onProgress?.(data.progress, data.message)
            break

          case 'proofComplete':
            clearTimeout(timeout)
            resolve({
              proof: data.proof,
              publicSignals: data.publicSignals,
              duration: data.duration
            })
            break

          case 'error':
            clearTimeout(timeout)
            reject(new Error(data.error))
            break
        }
      }

      worker.onerror = (error) => {
        clearTimeout(timeout)
        console.error('[Worker] Error:', error)
        reject(new Error('Worker error: ' + error.message))
      }

      // Send proof request to worker
      worker.postMessage({
        type: 'generateProof',
        circuitInputs,
        wasmUrl,
        zkeyUrl
      })

    } catch (error) {
      reject(error)
    }
  })
}

// Cached snarkjs instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let snarkjsInstance: any = null

/**
 * Generate proof on main thread (optimized)
 */
export async function generateProofOnMainThread(
  circuitInputs: Record<string, string | string[]>,
  wasmUrl: string,
  zkeyUrl: string,
  onProgress?: ProofProgressCallback
): Promise<ProofResult> {
  try {
    onProgress?.(10, 'Loading snarkjs...')

    // Reuse cached snarkjs
    if (!snarkjsInstance) {
      snarkjsInstance = await import('snarkjs')
    }
    const snarkjs = snarkjsInstance

    // Yield for UI update
    await new Promise(resolve => setTimeout(resolve, 50))

    onProgress?.(30, 'Loading circuit files...')

    // Yield for UI update
    await new Promise(resolve => setTimeout(resolve, 50))

    onProgress?.(50, 'Generating ZK proof...')

    const startTime = Date.now()

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmUrl,
      zkeyUrl
    )

    const duration = Date.now() - startTime

    onProgress?.(95, `Proof complete (${(duration / 1000).toFixed(1)}s)`)

    return { proof, publicSignals, duration }
  } catch (error) {
    console.error('[ZK] Proof generation failed:', error)
    const message = error instanceof Error ? error.message : String(error)

    // Convert error messages to user-friendly format
    if (message.includes('fetch')) {
      throw new Error('Failed to load circuit files. Please refresh the page.')
    }
    if (message.includes('memory') || message.includes('Memory')) {
      throw new Error('Out of memory. Please close other tabs and try again.')
    }
    throw new Error('ZK proof generation failed: ' + message)
  }
}

/**
 * Generate proof with worker, fallback to main thread if worker fails
 */
export async function generateProofWithFallback(
  circuitInputs: Record<string, string | string[]>,
  wasmUrl: string,
  zkeyUrl: string,
  onProgress?: ProofProgressCallback
): Promise<ProofResult> {
  // Run on main thread directly (avoiding Worker issues)
  // Worker has snarkjs dynamic import issues, using main thread for stability
  console.log('[ZK] Generating proof on main thread for stability')
  return await generateProofOnMainThread(circuitInputs, wasmUrl, zkeyUrl, onProgress)
}
