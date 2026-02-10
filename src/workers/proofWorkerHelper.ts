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

/**
 * Fallback: Generate proof on main thread
 */
export async function generateProofOnMainThread(
  circuitInputs: Record<string, string | string[]>,
  wasmUrl: string,
  zkeyUrl: string,
  onProgress?: ProofProgressCallback
): Promise<ProofResult> {
  onProgress?.(10, 'snarkjs 로딩 중...')

  const snarkjs = await import('snarkjs')

  onProgress?.(30, '회로 파일 로딩 중...')
  onProgress?.(50, 'ZK 증명 생성 중... (잠시 대기)')

  const startTime = Date.now()

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmUrl,
    zkeyUrl
  )

  const duration = Date.now() - startTime

  onProgress?.(90, `증명 완료 (${(duration / 1000).toFixed(1)}초)`)

  return { proof, publicSignals, duration }
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
  try {
    // Try worker first
    return await generateProofInWorker(circuitInputs, wasmUrl, zkeyUrl, onProgress)
  } catch (workerError) {
    console.warn('[ZK] Worker failed, falling back to main thread:', workerError)
    onProgress?.(5, 'Worker 실패, 메인 스레드로 전환...')

    // Fallback to main thread
    return await generateProofOnMainThread(circuitInputs, wasmUrl, zkeyUrl, onProgress)
  }
}
