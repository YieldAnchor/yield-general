# Database Schema

This directory documents the reviewed schema for the derived read model. The
authoritative definitions live in `database/migrations`.

## Authority

Soroban contracts are authoritative for protocol state. Every table here is a
**derived projection** rebuilt from observed chain events. If the database and
the chain disagree, the chain wins and the projection is re-indexed.

## Applying migrations

Migrations are plain SQL files applied in filename order:

| File                             | Contents                                               |
| -------------------------------- | ------------------------------------------------------ |
| `001_create_tables.sql`          | Scaffold tables (`pool_snapshots`, `transaction_logs`) |
| `002_create_protocol_tables.sql` | Phase 2 vault projection and indexer checkpoints       |

Apply migrations using the Supabase SQL editor, `psql`, or the repository migration script:

```bash
# Apply migrations in sequence:
DATABASE_URL=postgres://user:pass@host:5432/dbname pnpm run db:migrate
```

### Integration Testing

Database-backed integration tests for indexer projections and checkpoint resume reside in `services/indexer/test/database-integration.test.ts`.

The test suite skips execution when database environment variables are unset. Standard `pnpm test` runs remain hermetic and require no running database. To run tests against a live PostgreSQL or Supabase instance:

```bash
# 1. Apply migrations:
DATABASE_URL=postgres://... pnpm run db:migrate

# 2. Run the integration test suite:
SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... pnpm run test:integration
```

## Phase 2 tables

### `vaults`

One row per deployed `YieldVault` contract, derived from its `initialize` event
(topics `("initialize",)`, value `(admin, asset, name, symbol, decimals, simulation)`).

Note that `simulated_yield` mirrors `Config.simulation`, which the Phase 1
contract always sets to `true`. A `true` value means the vault's yield is the
Testnet ledger-time simulation, **not** real Treasury Bill or RWA yield.

### `vault_events`

Append-only, deduplicated projection of the contract's events. `event_id` is the
Soroban event id, so re-indexing an overlapping ledger range is idempotent.

Decoded event types and their value payloads (from the Phase 1 contract):

| `event_type` | Topics             | Value                                                |
| ------------ | ------------------ | ---------------------------------------------------- |
| `initialize` | `initialize`       | `(admin, asset, name, symbol, decimals, simulation)` |
| `deposit`    | `deposit`, user    | `(assets, shares)`                                   |
| `withdraw`   | `withdraw`, user   | `(assets, shares)`                                   |
| `share_mint` | `share_mint`, user | `shares`                                             |
| `share_burn` | `share_burn`, user | `shares`                                             |
| `yield`      | `yield`            | `(yield_amount, timestamp)`                          |
| `pause`      | `pause`            | admin                                                |
| `unpause`    | `unpause`          | admin                                                |

**Positions are not stored.** A user's share balance is derived from the event
log (`share_mint` minus `share_burn`). This keeps the append-only log as the
single derived source and avoids a second projection that can drift.

### `indexer_checkpoints`

One row per observed stream, holding the RPC cursor and last processed ledger so
the indexer resumes instead of replaying from `now` on every restart.

## Not yet modelled

Deliberately out of scope for Phase 2 (see the roadmap in the root README):

- Vault snapshots / historical state (needs contract state reads — Phase 5).
- Compliance, RWA instruments, strategy state, NAV, reserves, fees, treasury,
  and governance.
