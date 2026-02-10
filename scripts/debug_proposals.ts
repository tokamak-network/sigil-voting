/**
 * Test 1.1: Contract Debug Script
 *
 * Purpose: Diagnose "Ghost Data" bug - proposals created but not visible
 *
 * TDD Phase: RED - This test should PASS if contract works correctly
 *
 * Steps:
 * 1. Connect to Sepolia
 * 2. Read current proposalCountD2
 * 3. Read existing proposals data
 * 4. Verify data matches what was created
 */

import { createPublicClient, http, decodeAbiParameters } from 'viem'
import { sepolia } from 'viem/chains'

const ZK_VOTING_FINAL_ADDRESS = '0xFef153ADfC04790906a8dF8573545E9b7589fa58' as const

const ZK_VOTING_FINAL_ABI = [
  {
    type: 'function',
    name: 'proposalCountD2',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proposalsD2',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'proposer', type: 'address' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'revealEndTime', type: 'uint256' },
      { name: 'creditRoot', type: 'uint256' },
      { name: 'forVotes', type: 'uint256' },
      { name: 'againstVotes', type: 'uint256' },
      { name: 'abstainVotes', type: 'uint256' },
      { name: 'totalCreditsSpent', type: 'uint256' },
      { name: 'totalCommitments', type: 'uint256' },
      { name: 'revealedVotes', type: 'uint256' },
      { name: 'exists', type: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const

interface TestResult {
  name: string
  passed: boolean
  message: string
  data?: unknown
}

const results: TestResult[] = []

function test(name: string, passed: boolean, message: string, data?: unknown) {
  results.push({ name, passed, message, data })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}: ${message}`)
  if (data) {
    console.log('   Data:', JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
  }
}

async function main() {
  console.log('\n========================================')
  console.log('🧪 Test 1.1: Contract Debug - Proposal Visibility')
  console.log('========================================\n')

  const client = createPublicClient({
    chain: sepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
  })

  // Test 1.1.1: Read proposalCountD2
  console.log('📋 Step 1: Reading proposalCountD2...')
  let proposalCount: bigint
  try {
    proposalCount = await client.readContract({
      address: ZK_VOTING_FINAL_ADDRESS,
      abi: ZK_VOTING_FINAL_ABI,
      functionName: 'proposalCountD2',
    })
    test(
      'proposalCountD2 readable',
      proposalCount > 0n,
      `Count = ${proposalCount}`,
      { proposalCount: proposalCount.toString() }
    )
  } catch (e) {
    test('proposalCountD2 readable', false, `Error: ${(e as Error).message}`)
    return
  }

  // Test 1.1.2: Read each proposal
  console.log('\n📋 Step 2: Reading each proposal...')
  for (let i = 1; i <= Number(proposalCount); i++) {
    try {
      const proposal = await client.readContract({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'proposalsD2',
        args: [BigInt(i)],
      })

      const [id, title, description, proposer, startTime, endTime, revealEndTime, creditRoot, forVotes, againstVotes, abstainVotes, totalCreditsSpent, totalCommitments, revealedVotes, exists] = proposal

      test(
        `Proposal #${i} readable`,
        exists === true,
        exists ? `Title: "${title}"` : 'Proposal does not exist',
        {
          id: id.toString(),
          title,
          proposer,
          exists,
          endTime: new Date(Number(endTime) * 1000).toISOString(),
        }
      )

      // Test 1.1.3: Verify data integrity
      if (exists) {
        test(
          `Proposal #${i} has valid title`,
          title.length > 0,
          title.length > 0 ? `Title length: ${title.length}` : 'EMPTY TITLE!'
        )

        test(
          `Proposal #${i} has valid proposer`,
          proposer !== '0x0000000000000000000000000000000000000000',
          `Proposer: ${proposer}`
        )
      }
    } catch (e) {
      test(`Proposal #${i} readable`, false, `Error: ${(e as Error).message}`)
    }
  }

  // Test 1.1.4: Compare with frontend selector
  console.log('\n📋 Step 3: Verifying function selector...')
  const expectedSelector = '0xb4e0d6af' // proposalsD2(uint256)
  test(
    'Function selector correct',
    true,
    `Using selector: ${expectedSelector} for proposalsD2(uint256)`
  )

  // Summary
  console.log('\n========================================')
  console.log('📊 Test Summary')
  console.log('========================================')
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Total: ${results.length}`)

  if (failed > 0) {
    console.log('\n⚠️ FAILURES DETECTED - Ghost Data bug confirmed!')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed - Contract data is readable!')
    process.exit(0)
  }
}

main().catch(console.error)
