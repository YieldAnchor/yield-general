# YieldAnchor YieldVault — Phase 1

This crate contains the Phase 1 core YieldVault contract.

## Scope

Implemented in this phase:

- One-time initialization with admin, arbitrary underlying token, name, symbol, and decimals. Initialization is bound to the address that created the instance and to the creation salt.
- Asset deposits with proportional vault-share minting.
- Share redemption and asset withdrawal.
- Integer-only accounting with checked arithmetic and explicit floor/ceiling rounding.
- Admin pause/unpause controls.
- Soroban address authorization for initialization, user operations, and admin operations. The deployer must authorize `initialize`, and so must the admin when they are different addresses.
- Vault state, initialization, pause, balance, conversion, share-price, and liquidity read methods.
- Initialization, deposit, withdrawal, share mint/burn, yield, and pause events.

## Initialization

`initialize(deployer, salt, admin, asset, name, symbol, decimals)` succeeds only once, and only for the address that created the instance.

`deployer` and `salt` must be the pair supplied at creation. The contract re-derives the address with the host (`env.deployer().with_address(deployer, salt).deployed_address()`) and returns `BadDeployer` (code 17) when it is not this contract. That is the address preimage used by `stellar contract deploy --salt` and by `Operation.createCustomContract`. A factory must deploy the same way: `with_current_contract` builds a different address and will not pass the check.

`deployer.require_auth()` then runs, and `admin.require_auth()` runs as well when the admin is someone else. Authorization covers the full argument list, so a signature for one admin or one metadata value does not authorize another. Requiring only the admin's signature does not close the capture window: a front-runner can name itself as admin and sign that call. The creation check rejects that call even when the signature is valid.

`AlreadyInit` is checked first. A second call returns `AlreadyInit` even if the deployer, salt, or metadata would have been rejected on a fresh instance.

The `initialize` event is unchanged: `(admin, asset, name, symbol, decimals, simulation)`. Indexers do not need a new decoder. Instances that are already initialized keep their admin; this guarantee applies to instances built from this revision. The salt is public in the creation transaction. What matters is the deployer's signature, not secrecy of the salt. If initialize fails after creation, the salt is in `scripts/.deploy_salt` and can also be read back from the create-contract operation.

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
