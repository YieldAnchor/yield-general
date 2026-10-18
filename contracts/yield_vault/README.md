# YieldAnchor YieldVault — Phase 1

This crate contains the Phase 1 core YieldVault contract.

## Scope

Implemented in this phase:

- One-time initialization with admin, arbitrary underlying token, name, symbol, and decimals.
- Asset deposits with proportional vault-share minting.
- Share redemption and asset withdrawal.
- Integer-only accounting with checked arithmetic and explicit floor/ceiling rounding.
- Admin pause/unpause controls.
- Soroban address authorization for initialization, user operations, and admin operations.
- Vault state, initialization, pause, balance, conversion, share-price, and liquidity read methods.
- Initialization, deposit, withdrawal, share mint/burn, yield, and pause events.

## Simulated yield warning

The contract includes a deterministic simple-interest simulation at `8.00%` APR, derived only from Soroban ledger timestamps. This is enabled solely to support Phase 1 Testnet development and is exposed through the `simulation` field in `VaultState`.

It is **not** a Treasury Bill integration, RWA integration, oracle, strategy, reserve proof, NAV calculation, or real yield source. Simulated accounting yield does not mint underlying tokens; Testnet redemption tests must explicitly provide any additional token liquidity. Do not deploy this simulation for production funds or mainnet use.

## Unbacked yield limitations

**TESTNET SIMULATION ONLY:** immediately after a deposit, before redemptions or external top-ups, the deposited principal is backed by tokens held by the vault. Accruing simulated yield does not add any tokens. Nevertheless, `total_assets` includes principal plus accrued and pending simulated yield, so it can exceed the tokens actually held.

For example, an untouched 100-unit deposit can accrue 8 units of simulated yield while the vault still holds only 100 tokens. Redeeming all shares would require 108 tokens and returns `NoLiquidity` (code 10) unless the missing liquidity is supplied separately. This is an expected outcome of the simulation, not an exceptional token-transfer failure.

`share_price` is consequently optimistic: it values shares using accounted assets, including unbacked yield. `available_liquidity` reports the actual token balance that can fund payments. Deposits do transfer real principal, but a holder's eventual payout is still constrained by that liquidity, their shares, rounding, and the contract's other checks. Redemptions and external top-ups can change the relationship between principal and tokens held; there is no permanent guarantee that every reported asset or every holder's full principal remains withdrawable.

See the [observed Testnet limitations](../../docs/deployment/testnet.md#phase-1-limitations) for the existing deployment evidence. These are not real T-Bill/RWA returns or production-fund guarantees.

## Accounting model

- `principal` tracks assets deposited through the vault.
- `accrued` tracks crystallized simulated yield.
- `rem` preserves fractional integer yield between accruals.
- `total_assets = principal + accrued` plus pending ledger-time simulation in read-only views.
- Initial deposits mint one share per underlying unit.
- Later deposits use floor rounding: `assets * total_shares / total_assets`.
- Redemptions use floor rounding for assets.
- Asset-targeted withdrawals use ceiling rounding for shares and transfer exactly the requested assets.
- Share price is returned at `1e18` precision.

## Verification

Run from the repository root:

```bash
cargo fmt --all -- --check
cargo check -p yield_vault
cargo test -p yield_vault
cargo clippy -p yield_vault --all-targets -- -D warnings
```
