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

## Unbacked yield limitation (Testnet simulation only)

In Phase 1, simulated yield is an accounting figure calculated from ledger timestamps; **no underlying tokens are minted or deposited to cover accrued yield**. This is strictly a **TESTNET SIMULATION ONLY** for integration testing and contract development, and **not** real Treasury Bill or real-world asset (RWA) yield.

Consequently:

- **Backing invariant**: The vault's actual token balance on the underlying Stellar Asset Contract equals `principal` (the assets deposited minus withdrawals/redemptions), whereas accounted `total_assets` equals `principal + accrued`.
- **Deposits are fully backed**: Depositors are always guaranteed to be able to withdraw up to the liquid principal held by the vault.
- **Full redemptions revert once yield accrues**: When a user attempts to redeem 100% of their shares after yield has accrued, the vault calculates a payout of `principal + accrued`, exceeding its token balance. The redemption reverts with `NoLiquidity` (error code `10`). On this Phase 1 Testnet vault, `NoLiquidity` on a full redemption is an expected consequence of unbacked yield rather than an implementation defect.
- **Optimistic `share_price` vs. honest `available_liquidity`**: The published `share_price` reflects the full nominal value (`total_assets / total_shares`), which is inherently optimistic under unbacked simulation. Callers must consult `available_liquidity` (or `max_redeemable`) for the true ceiling on what can actually be settled.

See [`docs/deployment/testnet.md`](../../docs/deployment/testnet.md#phase-1-limitations) for real on-chain evidence and deployment observations on Stellar Testnet.

## Sizing redemptions

`max_redeemable` (TypeScript: `YieldVaultClient.maxRedeemable()`) returns the largest vault-wide share amount that current token liquidity can settle at the current ledger timestamp. It is read-only, includes pending simulated yield, and uses the same floor rounding as `redeem`. Empty, paused, or zero-liquidity vaults return zero; an uninitialized vault still returns `NotInit`.

When liquidity covers all accounted assets, the limit is total share supply. Otherwise the exact upper bound is `ceil((liquidity + 1) * totalShares / totalAssets) - 1`, evaluated using checked arithmetic without an overflowing intermediate product. For example, 100 liquid units with 108 accounted units and 100 shares can settle 93 shares, not merely the 92 obtained by floor-converting liquidity to shares.

Callers must also cap this value by their own share balance. The view does not reserve liquidity or include a guessed delay margin: time, another redemption, or a pause between reading and submission can invalidate the result. Re-simulate before signing and allow for those changes; no future transaction success is guaranteed. Existing deployed contracts need a new deployment to expose this additional view.

## Verification

Run from the repository root:

```bash
cargo fmt --all -- --check
cargo check -p yield_vault
cargo test -p yield_vault
cargo clippy -p yield_vault --all-targets -- -D warnings
```
