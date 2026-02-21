import type { Metadata } from 'next'
import { TechnologyContent } from '../../../src/components/pages/TechnologyContent'

export const metadata: Metadata = {
  title: 'Technology — ZK Proof Architecture',
  description:
    'Three cryptographic pillars — ZK private voting, quadratic fairness, and MACI anti-collusion — working together. Built on Ethereum PSE research with Groth16 proofs.',
  alternates: { canonical: '/technology' },
  openGraph: {
    title: 'SIGIL Technology — ZK Proof Architecture',
    description: 'Three cryptographic pillars working together for private, fair, and bribe-proof DAO governance.',
    url: '/technology',
  },
}

export default function TechnologyRoute() {
  return <TechnologyContent />
}
