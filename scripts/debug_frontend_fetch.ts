/**
 * Test 1.2: Frontend Integration Debug
 *
 * Purpose: Simulate exactly what the frontend does to fetch proposals
 *
 * TDD Phase: RED - Find the bug in frontend fetching logic
 */

import { createPublicClient, http, decodeAbiParameters } from 'viem'
import { sepolia } from 'viem/chains'

const ZK_VOTING_FINAL_ADDRESS = '0xFef153ADfC04790906a8dF8573545E9b7589fa58'

// Simulate EXACTLY what frontend does
async function simulateFrontendFetch() {
  console.log('\n========================================')
  console.log('🧪 Test 1.2: Frontend Integration Debug')
  console.log('========================================\n')

  const client = createPublicClient({
    chain: sepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
  })

  // Step 1: Get proposal count (like useReadContract)
  console.log('📋 Step 1: Simulating useReadContract for proposalCountD2...')
  const countResult = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: ZK_VOTING_FINAL_ADDRESS,
        data: '0x03a229f7' // proposalCountD2()
      }, 'latest'],
      id: 1
    })
  })
  const countData = await countResult.json()
  console.log('Raw count result:', countData.result)
  const proposalCount = parseInt(countData.result, 16)
  console.log(`Parsed count: ${proposalCount}`)

  // Step 2: Fetch each proposal (like frontend fetchProposals)
  console.log('\n📋 Step 2: Simulating fetchProposals loop...')

  for (let i = 1; i <= proposalCount; i++) {
    console.log(`\n--- Fetching Proposal #${i} ---`)

    // This is EXACTLY what frontend does
    const selector = 'b4e0d6af' // proposalsD2(uint256)
    const paddedId = i.toString(16).padStart(64, '0')
    const calldata = `0x${selector}${paddedId}`

    console.log(`Calldata: ${calldata}`)

    const response = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{
          to: ZK_VOTING_FINAL_ADDRESS,
          data: calldata
        }, 'latest'],
        id: i
      })
    })

    const result = await response.json()
    console.log(`Raw result length: ${result.result?.length || 0} chars`)

    if (!result.result || result.result === '0x') {
      console.log('❌ Empty result!')
      continue
    }

    // Step 3: Decode (like decodeProposalResult)
    try {
      const decoded = decodeAbiParameters(
        [
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
        result.result as `0x${string}`
      )

      console.log('✅ Decoded successfully!')
      console.log(`   ID: ${decoded[0]}`)
      console.log(`   Title: "${decoded[1]}"`)
      console.log(`   Proposer: ${decoded[3]}`)
      console.log(`   Exists: ${decoded[14]}`)

      // Check if title would pass frontend filter
      const title = decoded[1] as string
      if (title) {
        console.log('✅ Title is truthy - would appear in UI')
      } else {
        console.log('❌ Title is falsy - would be filtered out!')
      }

    } catch (e) {
      console.log('❌ Decode failed:', (e as Error).message)
    }
  }

  console.log('\n========================================')
  console.log('📊 Frontend Simulation Complete')
  console.log('========================================')
}

simulateFrontendFetch().catch(console.error)
