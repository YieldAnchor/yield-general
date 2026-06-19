# 📈 YieldAnchor Protocol

YieldAnchor is an institutional-grade, decentralized money market and tokenized Treasury Bill (T-Bill) yield aggregator engineered natively on the Stellar Network using Soroban smart contracts. 

The platform abstracts complex on-chain interest-bearing mechanics into high-efficiency liquid vaults. Institutional depositors can safely anchor digital capital (USDC/EURC) into real-world asset (RWA) primitives, generating programmatic, real-time yield calculated purely on-chain via ledger timestamps.

---

## 🛠️ System Architecture & Tech Stack

YieldAnchor is structured as a hybrid full-stack Web3 application designed for instant UI performance, low data-latency, and safe transaction execution.

* **Smart Contracts (Blockchain Layer):** Built using Rust and the `soroban-sdk` (v21.0.0). Leverages structured persistent/instance ledger storage mechanics and native Stellar Asset Contracts (SAC) to safely manage lockups.
* **Backend API (Indexing Layer):** Node.js + Express microservice running TypeScript. Integrated with a Supabase database instance to poll, decode, and log transactional event streams emitted by the Soroban Testnet RPC.
* **Frontend Dashboard (Client Layer):** A client-side managed SPA built with React, Vite, and TypeScript. Styled entirely using high-fidelity, light-mode institutional UI principles and interactive state wrappers backed by the `@stellar/freighter-api`.

```text
  ┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
  │  React Client   │ ──────> │ Express Backend  │ ──────> │  Supabase DB    │
  │ (Freighter Auth)│ <────── │  (REST API /)    │ <────── │ (Cached Metric) │
  └────────┬────────┘         └──────────────────┘         └─────────────────┘
           │
           │ (Submit Transactions / Listen to Events)
           ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                   Stellar Testnet RPC Engine (Soroban)                   │
  └──────────────────────────────────────────────────────────────────────────┘


├── /backend                    # Express API server & Soroban ledger event indexer
│   ├── src/
│   │   ├── index.ts            # REST endpoints (/api/pool-stats)
│   │   └── watcher.ts          # Soroban event polling routine
│   └── package.json
│
├── /contracts/yield_vault      # Soroban Smart Contract Development Workspace
│   ├── src/
│   │   └── lib.rs              # Core YieldVault contract compilation logic
│   └── Cargo.toml              # Rust crate configurations & SDK flags
│
└── /frontend                   # React SPA Investor Interface
    ├── src/
    │   ├── App.tsx             # State view router (Landing, Auth, Dashboard)
    │   ├── main.tsx            # DOM initialization entry
    │   └── index.css           # Global full-viewport structural resets
    └── package.json
