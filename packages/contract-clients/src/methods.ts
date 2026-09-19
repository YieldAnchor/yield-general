import { MAX_REDEEMABLE_METHOD } from '@yieldanchor/constants';

/**
 * `YieldVault` entry points, as named in the contract's ABI.
 *
 * Soroban resolves a method by name, so a typo here fails on-chain rather than
 * at compile time. A test asserts every constant below exists as a `pub fn` in
 * `contracts/yield_vault/src/lib.rs`.
 */
export const VAULT_METHODS = {
  // State-changing.
  initialize: 'initialize',
  deposit: 'deposit',
  redeem: 'redeem',
  withdraw: 'withdraw',
  accrueYield: 'accrue_yield',
  pause: 'pause',
  unpause: 'unpause',

  // Admin-only control, read through the same client.
  isPaused: 'is_paused',
  isInitialized: 'is_initialized',

  // Read-only.
  getVaultState: 'get_vault_state',
  admin: 'admin',
  asset: 'asset',
  name: 'name',
  symbol: 'symbol',
  decimals: 'decimals',
  balanceOf: 'balance_of',
  underlyingBalanceOf: 'underlying_balance_of',
  availableLiquidity: 'available_liquidity',
  maxRedeemable: MAX_REDEEMABLE_METHOD,
  totalAssets: 'total_assets',
  totalShares: 'total_shares',
  sharePrice: 'share_price',
  convertToShares: 'convert_to_shares',
  convertToAssets: 'convert_to_assets',
} as const;

export type VaultMethod = (typeof VAULT_METHODS)[keyof typeof VAULT_METHODS];

/** Methods that mutate vault state and therefore produce a transaction. */
export const VAULT_WRITE_METHODS = [
  VAULT_METHODS.initialize,
  VAULT_METHODS.deposit,
  VAULT_METHODS.redeem,
  VAULT_METHODS.withdraw,
  VAULT_METHODS.accrueYield,
  VAULT_METHODS.pause,
  VAULT_METHODS.unpause,
] as const;
