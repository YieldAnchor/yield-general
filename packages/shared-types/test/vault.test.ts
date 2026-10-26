import { VAULT_ERROR_CODES } from '@yieldanchor/constants';
import { describe, expect, it } from 'vitest';

import {
  type DecodedVaultEvent,
  type VaultEventRow,
  type VaultRow,
  type VaultState,
  describeVaultError,
  isKnownVaultErrorCode,
  isShareMovement,
} from '../src/index.js';

describe('describeVaultError', () => {
  it('has a message for every contract error code', () => {
    for (const code of Object.values(VAULT_ERROR_CODES)) {
      const message = describeVaultError(code);

      expect(message).not.toContain('unknown error code');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('explains the pause and share errors', () => {
    expect(describeVaultError(VAULT_ERROR_CODES.Paused)).toMatch(/paused/i);
    expect(describeVaultError(VAULT_ERROR_CODES.NoShares)).toMatch(/shares/i);
    expect(describeVaultError(VAULT_ERROR_CODES.Overflow)).toMatch(
      /integer range/i,
    );
    expect(describeVaultError(VAULT_ERROR_CODES.BadDeployer)).toMatch(
      /deployer and salt/i,
    );
  });

  it('does not pretend to know an unrecognised code', () => {
    expect(describeVaultError(404)).toBe(
      'The contract rejected the call with unknown error code 404.',
    );
  });
});

describe('isKnownVaultErrorCode', () => {
  it('accepts contract codes and rejects anything else', () => {
    expect(isKnownVaultErrorCode(VAULT_ERROR_CODES.RoundEmpty)).toBe(true);
    expect(isKnownVaultErrorCode(0)).toBe(false);
    expect(isKnownVaultErrorCode(9000)).toBe(false);
  });
});

describe('isShareMovement', () => {
  const event = (
    eventType: DecodedVaultEvent['eventType'],
  ): DecodedVaultEvent => ({
    eventId: 'event-1',
    vaultId: 'CABCDEF',
    eventType,
    userAddress: 'GUSER',
    assets: 1n,
    shares: 1n,
    ledger: 10,
    txHash: 'deadbeef',
    ledgerClosedAt: null,
    vault: null,
  });

  it('recognises the events that move shares', () => {
    expect(isShareMovement(event('deposit'))).toBe(true);
    expect(isShareMovement(event('withdraw'))).toBe(true);
    expect(isShareMovement(event('share_mint'))).toBe(true);
    expect(isShareMovement(event('share_burn'))).toBe(true);
  });

  it('ignores control and yield events', () => {
    expect(isShareMovement(event('initialize'))).toBe(false);
    expect(isShareMovement(event('yield'))).toBe(false);
    expect(isShareMovement(event('pause'))).toBe(false);
  });
});

describe('amount-carrying types', () => {
  it('keeps 128-bit amounts exact through the domain and row shapes', () => {
    const i128Max = 170141183460469231731687303715884105727n;

    const state: VaultState = {
      admin: 'GADMIN',
      asset: 'GASSET',
      name: 'YieldAnchor Vault',
      symbol: 'yVAULT',
      decimals: 6,
      simulation: true,
      principal: i128Max,
      accrued: 0n,
      assets: i128Max,
      shares: i128Max,
      price: 1_000_000_000_000_000_000n,
      lastTs: 1_700_000_000,
      paused: false,
    };

    const vaultRow: VaultRow = {
      contract_id: 'CABCDEF',
      admin: state.admin,
      asset: state.asset,
      name: state.name,
      symbol: state.symbol,
      decimals: state.decimals,
      simulated_yield: state.simulation,
      created_ledger: 42,
    };

    const eventRow: VaultEventRow = {
      event_id: 'event-1',
      vault_id: 'CABCDEF',
      event_type: 'deposit',
      user_address: 'GUSER',
      assets: i128Max.toString(),
      shares: i128Max.toString(),
      ledger: 42,
      tx_hash: 'deadbeef',
      ledger_closed_at: null,
    };

    expect(BigInt(eventRow.assets ?? '0')).toBe(i128Max);
    expect(state.assets).toBe(i128Max);
    expect(vaultRow.created_ledger).toBe(42);
  });
});
