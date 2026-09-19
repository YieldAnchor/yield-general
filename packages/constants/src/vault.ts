/**
 * Protocol parameters that mirror `contracts/yield_vault`.
 *
 * These are duplicated from the Rust crate on purpose: the off-chain
 * workspaces need the same denominators to display and validate amounts
 * without reading the wasm. Keep them in sync with the constants block at the
 * top of `contracts/yield_vault/src/lib.rs`.
 */

/**
 * Phase 1 accrues a deterministic, ledger-time-based yield instead of reading a
 * real yield source.
 *
 * This is TESTNET SIMULATION ONLY. It is not Treasury Bill, money-market, or
 * any other real RWA yield, and no value derived from it should be presented as
 * a real return.
 */
export const SIMULATED_YIELD = true;

/** Simulated annual rate: 800 basis points (8.00% APY). */
export const SIM_APY_BPS = 800;

/** Basis-point denominator: 10_000 bps = 100%. */
export const BPS_DENOM = 10_000;

/** Seconds in the 365-day year the simulation accrues against. */
export const SIM_YEAR_SECONDS = 31_536_000;

/** Simulated-yield denominator: `BPS_DENOM * SIM_YEAR_SECONDS`. */
export const YIELD_DENOM = BPS_DENOM * SIM_YEAR_SECONDS;

/** Scale applied to the reported share price (`1e18`). */
export const PRICE_SCALE = 1_000_000_000_000_000_000n;

/** Largest `decimals` the vault accepts at initialization. */
export const MAX_VAULT_DECIMALS = 18;

/** Longest accepted vault name, in characters. */
export const MAX_VAULT_NAME_LENGTH = 32;

/** Longest accepted vault symbol, in characters. */
export const MAX_VAULT_SYMBOL_LENGTH = 32;

export const MAX_REDEEMABLE_METHOD = 'max_redeemable' as const;
