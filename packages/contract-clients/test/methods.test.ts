import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { VAULT_METHODS, VAULT_WRITE_METHODS } from '../src/index.js';

/**
 * Contract methods are resolved by name at runtime, so a typo in this package
 * would only surface on-chain. Checking the names against the crate's source
 * turns that into a failing unit test.
 */
const CONTRACT_SOURCE = readFileSync(
  fileURLToPath(
    new URL('../../../contracts/yield_vault/src/lib.rs', import.meta.url),
  ),
  'utf8',
);

const declaredMethods = new Set(
  Array.from(CONTRACT_SOURCE.matchAll(/pub fn ([a-z_]+)\(/g)).map(
    (match) => match[1],
  ),
);

describe('VAULT_METHODS', () => {
  it('declares every method the contract exposes', () => {
    for (const method of Object.values(VAULT_METHODS)) {
      expect(declaredMethods, `contract has no pub fn ${method}`).toContain(
        method,
      );
    }
  });

  it('covers all callable methods without exposing the host-only constructor', () => {
    expect(declaredMethods.size).toBeGreaterThan(0);
    expect(declaredMethods).toContain('__constructor');
    expect(
      [...declaredMethods]
        .filter((method) => method !== '__constructor')
        .sort(),
    ).toEqual([...Object.values(VAULT_METHODS)].sort());
  });

  it('names every write method explicitly', () => {
    for (const method of VAULT_WRITE_METHODS) {
      expect(Object.values(VAULT_METHODS)).toContain(method);
    }
  });

  it('keeps the snake_case wire names', () => {
    expect(VAULT_METHODS.getVaultState).toBe('get_vault_state');
    expect(VAULT_METHODS.accrueYield).toBe('accrue_yield');
    expect(VAULT_METHODS.balanceOf).toBe('balance_of');
    expect(VAULT_METHODS.convertToShares).toBe('convert_to_shares');
  });
});
