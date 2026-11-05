import { MAX_VAULT_DECIMALS } from '@yieldanchor/constants';
import {
  isValidAccountId,
  isValidAmountString,
  isValidContractId,
  isValidStellarAddress,
  parseUnits,
} from '@yieldanchor/stellar-utils';
import { z } from 'zod';

/**
 * Primitive schemas for Stellar identifiers and vault amounts.
 *
 * Address validation is checksum-based, not prefix-based: a value that only
 * looks like an address would otherwise reach the user's wallet and fail
 * on-chain after they had already approved it.
 */

/** A Stellar account address (`G...`) with a valid checksum. */
export const stellarAccountIdSchema = z
  .string()
  .refine(isValidAccountId, 'Not a valid Stellar account address');

/** A Soroban contract id (`C...`) with a valid checksum. */
export const contractIdSchema = z
  .string()
  .refine(isValidContractId, 'Not a valid Soroban contract id');

/** Either an account address or a contract id. */
export const stellarAddressSchema = z
  .string()
  .refine(isValidStellarAddress, 'Not a valid Stellar address');

/** Vault decimals: an integer within the range the contract accepts. */
export const decimalsSchema = z
  .number()
  .int('Decimals must be a whole number')
  .min(0, 'Decimals cannot be negative')
  .max(MAX_VAULT_DECIMALS, `Decimals cannot exceed ${MAX_VAULT_DECIMALS}`);

/**
 * An amount already expressed in integer base units, accepted either as a
 * `bigint` or as an integer string (the shape PostgREST and JSON return).
 *
 * Rejected rather than coerced: `1.5` base units does not exist.
 */
export const baseUnitAmountSchema = z
  .union([
    z.bigint(),
    z
      .string()
      .trim()
      .regex(/^-?\d+$/, 'Not an integer amount'),
  ])
  .transform((value) => (typeof value === 'bigint' ? value : BigInt(value)));

/** A base-unit amount that must be greater than zero, as deposits require. */
export const positiveBaseUnitAmountSchema = baseUnitAmountSchema.refine(
  (value) => value > 0n,
  'Amount must be greater than zero',
);

/** A base-unit amount that must not be negative (used for views and previews). */
export const nonNegativeBaseUnitAmountSchema = baseUnitAmountSchema.refine(
  (value) => value >= 0n,
  'Amount cannot be negative',
);

/** A 32-byte salt as a hex string (64 hex characters). */
export const saltSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, 'Salt must be a 32-byte hex string (64 hex characters)');

/**
 * A user-typed decimal amount for an asset with `decimals` places.
 *
 * More decimal places than the asset supports is an error, not a rounding
 * opportunity: silently truncating would deposit a different amount than the
 * user entered.
 */
export function decimalAmountSchema(decimals: number) {
  return z
    .string()
    .trim()
    .refine(
      (value) => isValidAmountString(value, decimals),
      `Not a valid amount with at most ${decimals} decimal places`,
    )
    .transform((value) => parseUnits(value, decimals));
}
