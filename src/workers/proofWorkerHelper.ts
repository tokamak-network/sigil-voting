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

// 캐시된 snarkjs 인스턴스
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
    onProgress?.(10, 'snarkjs 로딩 중...')

    // snarkjs 캐싱으로 재사용
    if (!snarkjsInstance) {
      snarkjsInstance = await import('snarkjs')
    }
    const snarkjs = snarkjsInstance

    // UI 업데이트를 위한 yield
    await new Promise(resolve => setTimeout(resolve, 50))

    onProgress?.(30, '회로 파일 로딩 중...')

    // UI 업데이트를 위한 yield
    await new Promise(resolve => setTimeout(resolve, 50))

    onProgress?.(50, 'ZK 증명 생성 중...')

    const startTime = Date.now()

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmUrl,
      zkeyUrl
    )

    const duration = Date.now() - startTime

    onProgress?.(95, `증명 완료 (${(duration / 1000).toFixed(1)}초)`)

    return { proof, publicSignals, duration }
  } catch (error) {
    console.error('[ZK] Proof generation failed:', error)
    const message = error instanceof Error ? error.message : String(error)

    // 일반적인 에러 메시지를 사용자 친화적으로 변환
    if (message.includes('fetch')) {
      throw new Error('회로 파일을 로드할 수 없습니다. 페이지를 새로고침해주세요.')
    }
    if (message.includes('memory') || message.includes('Memory')) {
      throw new Error('메모리 부족. 다른 탭을 닫고 다시 시도해주세요.')
    }
    throw new Error('ZK 증명 생성 실패: ' + message)
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
  // 바로 메인 스레드에서 실행 (Worker 이슈 방지)
  // Worker는 snarkjs 동적 import 문제가 있어서 안정성을 위해 메인 스레드 사용
  console.log('[ZK] Generating proof on main thread for stability')
  return await generateProofOnMainThread(circuitInputs, wasmUrl, zkeyUrl, onProgress)
}
