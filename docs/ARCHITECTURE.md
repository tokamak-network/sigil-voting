# System Architecture

## Overview

zkDEX D1 Private Voting Demo는 영지식 증명 기반 비밀 투표 시스템의 프론트엔드 데모입니다.

## System Design Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Landing   │  │  Proposals  │  │  Proposal   │  │  My Votes   │   │
│  │    Page     │  │    List     │  │   Detail    │  │    Page     │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │               │                │                │            │
│         └───────────────┴────────────────┴────────────────┘            │
│                                  │                                      │
│                           ┌──────▼──────┐                              │
│                           │   App.tsx   │                              │
│                           │  (Router)   │                              │
│                           └──────┬──────┘                              │
│                                  │                                      │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────┐
│                          STATE MANAGEMENT                               │
├──────────────────────────────────┼──────────────────────────────────────┤
│                                  │                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Proposals  │  │  My Votes   │  │   Voting    │  │  Language   │   │
│  │    State    │  │    State    │  │   State     │  │    State    │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────┐
│                          WALLET CONNECTION                              │
├──────────────────────────────────┼──────────────────────────────────────┤
│                                  │                                      │
│                           ┌──────▼──────┐                              │
│                           │    wagmi    │                              │
│                           │  (Web3 SDK) │                              │
│                           └──────┬──────┘                              │
│                                  │                                      │
│         ┌────────────────────────┼────────────────────────┐            │
│         │                        │                        │            │
│  ┌──────▼──────┐          ┌──────▼──────┐         ┌──────▼──────┐     │
│  │  MetaMask   │          │   Coinbase  │         │   WalletC.  │     │
│  │   Wallet    │          │    Wallet   │         │             │     │
│  └─────────────┘          └─────────────┘         └─────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────┐
│                            BLOCKCHAIN                                    │
├──────────────────────────────────┼──────────────────────────────────────┤
│                                  │                                      │
│                           ┌──────▼──────┐                              │
│                           │  Ethereum   │                              │
│                           │   Sepolia   │                              │
│                           │  (Testnet)  │                              │
│                           └─────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Structure

```
App.tsx
├── Header
│   ├── Logo
│   ├── Navigation (Home, Proposals, My Votes)
│   ├── Language Toggle (KO/EN)
│   └── Wallet Connection
│
├── Landing Page
│   ├── Hero Section
│   ├── Comparison Section (Normal vs ZK Voting)
│   ├── Problem Section (Why Private Voting?)
│   ├── How It Works (4 Steps)
│   ├── Benefits Section (6 cards)
│   ├── Commit-Reveal Section
│   ├── Use Cases Section (4 cards)
│   ├── Security Section (3 cards)
│   ├── FAQ Section
│   └── CTA Section
│
├── Proposals Page
│   ├── Page Header (Stats, Create Button)
│   ├── Filter Bar (All, Active, Closed)
│   └── Proposal Cards
│
├── Proposal Detail Page
│   ├── Back Button
│   ├── Proposal Header (ID, Category, Status)
│   ├── Description
│   ├── Voting Section
│   │   ├── Choice Buttons (For, Against, Abstain)
│   │   ├── ZK Notice
│   │   ├── Sealing Progress (Animation)
│   │   └── Vote Submitted (Commitment Hash)
│   └── Sidebar (Results, Info)
│
├── Create Proposal Page
│   └── Form (Title, Category, Duration, Description)
│
├── My Votes Page
│   ├── Voting Power Display
│   └── Vote History Cards
│
└── Footer
```

## Data Flow

### Voting Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Select  │───▶│ Choose  │───▶│Generate │───▶│ Submit  │───▶│ Update  │
│Proposal │    │ Choice  │    │ZK Proof │    │Commitmt │    │  State  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                   │              │              │              │
                   ▼              ▼              ▼              ▼
              For/Against/   Simulated     0x7f3a...      proposals[]
               Abstain      Animation     (hash)         myVotes[]
```

### State Management

| State | Type | Description |
|-------|------|-------------|
| `currentPage` | string | Current page view |
| `proposals` | Proposal[] | List of all proposals |
| `selectedProposal` | Proposal | Currently viewed proposal |
| `myVotes` | MyVote[] | User's voting history |
| `votingPhase` | string | select / sealing / submitted |
| `selectedChoice` | string | for / against / abstain |
| `lang` | string | ko / en |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` (landing) | Main landing page with all info sections |
| Proposals | `/` (proposals) | List of governance proposals |
| Proposal Detail | `/` (proposal-detail) | Single proposal view with voting |
| Create Proposal | `/` (create-proposal) | Form to create new proposal |
| My Votes | `/` (my-votes) | User's voting history |

## Internationalization (i18n)

- **Supported Languages**: Korean (ko), English (en)
- **Implementation**: Translation object with all UI strings
- **Toggle**: Header button switches between languages
- **Storage**: React state (resets on refresh)

## Simulated Features

This demo simulates the following (not actual blockchain interaction):

| Feature | Simulation |
|---------|------------|
| ZK Proof Generation | Progress animation (2 seconds) |
| Commitment Hash | Random hex string generation |
| Vote Recording | Local state update |
| Proposal Data | Hardcoded sample data |

## Future Implementation

For production, the following would need real implementation:

1. **Smart Contracts**: Voting contract with commit-reveal logic
2. **ZK Circuits**: Circom circuits for private voting proofs
3. **Backend**: Merkle tree management, nullifier tracking
4. **IPFS**: Proposal content storage
