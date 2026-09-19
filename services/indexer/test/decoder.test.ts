import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { Api } from '@stellar/stellar-sdk/rpc';
import { describe, expect, it } from 'vitest';

import { decodeVaultEvent } from '../src/decoder.js';

const CONTRACT_ID = 'CCUVKZGWKYDIB7L3DT4KSFGAIPUOXZRMML2QTHBDLHSOHCYD5ZXK6PPK';
const ADMIN = 'GDDB57WR5G7IVSLVKLIH5DBOAIQAPV4EEGCDFBDAHM7GQ4EPJKEM7L2F';
const USER = Keypair.random().publicKey();
const I128_MAX = 170141183460469231731687303715884105727n;

/**
 * The SDK's `ScValType` union omits `bool` even though booleans are supported,
 * so booleans are built by inference (`nativeToScVal(true)` → `scvBool`).
 */
type ScValTypeName = 'address' | 'i128' | 'string' | 'symbol' | 'u32' | 'u64';

/** Build a scalar ScVal the way the Phase 1 contract would publish it. */
function scv(value: unknown, type?: ScValTypeName): xdr.ScVal {
  return nativeToScVal(value, type ? { type } : undefined);
}

/** A Soroban tuple/vec payload, which is how the contract sends event data. */
function vec(...items: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec(items);
}

function makeEvent(
  overrides: {
    topic?: xdr.ScVal[];
    value?: xdr.ScVal;
    contractId?: { toString(): string } | null;
    ledger?: number;
    txHash?: string;
    id?: string;
  } = {},
): Api.EventResponse {
  const contractId =
    overrides.contractId === null
      ? undefined
      : (overrides.contractId ?? { toString: () => CONTRACT_ID });

  return {
    id: overrides.id ?? '0000001000-0000000001',
    type: 'contract',
    ledger: overrides.ledger ?? 1000,
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    transactionIndex: 1,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: overrides.txHash ?? 'deadbeef',
    contractId,
    topic: overrides.topic ?? [],
    value: overrides.value ?? xdr.ScVal.scvVoid(),
  } as unknown as Api.EventResponse;
}

const depositTopic = [scv('deposit', 'symbol'), scv(USER, 'address')];

describe('decodeVaultEvent', () => {
  it('decodes a deposit with its user and both amounts', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: depositTopic,
        value: vec(scv(500n, 'i128'), scv(495n, 'i128')),
      }),
    );

    expect(decoded).not.toBeNull();
    expect(decoded?.eventType).toBe('deposit');
    expect(decoded?.vaultId).toBe(CONTRACT_ID);
    expect(decoded?.userAddress).toBe(USER);
    expect(decoded?.assets).toBe(500n);
    expect(decoded?.shares).toBe(495n);
    expect(decoded?.vault).toBeNull();
  });

  it('decodes a withdrawal the same way', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('withdraw', 'symbol'), scv(USER, 'address')],
        value: vec(scv(40n, 'i128'), scv(41n, 'i128')),
      }),
    );

    expect(decoded?.eventType).toBe('withdraw');
    expect(decoded?.assets).toBe(40n);
    expect(decoded?.shares).toBe(41n);
  });

  it('decodes share_mint as a share amount only', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('share_mint', 'symbol'), scv(USER, 'address')],
        value: scv(495n, 'i128'),
      }),
    );

    expect(decoded?.eventType).toBe('share_mint');
    expect(decoded?.shares).toBe(495n);
    expect(decoded?.assets).toBeNull();
  });

  it('decodes share_burn as a share amount only', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('share_burn', 'symbol'), scv(USER, 'address')],
        value: scv(41n, 'i128'),
      }),
    );

    expect(decoded?.eventType).toBe('share_burn');
    expect(decoded?.shares).toBe(41n);
  });

  it('decodes accrued yield, which carries no user', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('yield', 'symbol')],
        value: vec(scv(80n, 'i128'), scv(31536000n, 'u64')),
      }),
    );

    expect(decoded?.eventType).toBe('yield');
    expect(decoded?.assets).toBe(80n);
    expect(decoded?.userAddress).toBeNull();
  });

  it.each(['pause', 'unpause'])('decodes %s with no amounts', (kind) => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv(kind, 'symbol')],
        value: scv(ADMIN, 'address'),
      }),
    );

    expect(decoded?.eventType).toBe(kind);
    expect(decoded?.assets).toBeNull();
    expect(decoded?.shares).toBeNull();
  });

  it('decodes initialization into vault metadata', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('initialize', 'symbol')],
        value: vec(
          scv(ADMIN, 'address'),
          scv(CONTRACT_ID, 'address'),
          scv('YieldAnchor Vault', 'string'),
          scv('yVAULT', 'string'),
          scv(6, 'u32'),
          scv(true),
        ),
      }),
    );

    expect(decoded?.eventType).toBe('initialize');
    expect(decoded?.vault).toEqual({
      contractId: CONTRACT_ID,
      admin: ADMIN,
      asset: CONTRACT_ID,
      name: 'YieldAnchor Vault',
      symbol: 'yVAULT',
      decimals: 6,
      simulatedYield: true,
    });
  });

  it('preserves a full-width i128 without precision loss', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: depositTopic,
        value: vec(scv(I128_MAX, 'i128'), scv(I128_MAX, 'i128')),
      }),
    );

    expect(decoded?.assets?.toString()).toBe(
      '170141183460469231731687303715884105727',
    );
  });

  it.each(['deposit', 'withdraw'])(
    'rejects %s payloads with the wrong tuple length',
    (kind) => {
      for (const value of [
        vec(),
        vec(scv(1n, 'i128')),
        vec(scv(1n, 'i128'), scv(2n, 'i128'), scv(3n, 'i128')),
        scv(1n, 'i128'),
      ]) {
        expect(
          decodeVaultEvent(
            makeEvent({
              topic: [scv(kind, 'symbol'), scv(USER, 'address')],
              value,
            }),
          ),
        ).toBeNull();
      }
    },
  );

  it('rejects the legacy scaffold deposit payload instead of misattributing amounts', () => {
    expect(
      decodeVaultEvent(
        makeEvent({
          topic: depositTopic,
          value: vec(
            scv(USER, 'address'),
            scv(1000n, 'i128'),
            scv(80n, 'i128'),
          ),
        }),
      ),
    ).toBeNull();
  });

  it.each(['deposit', 'withdraw'])(
    'rejects %s when either amount is not an integer',
    (kind) => {
      for (const invalid of [
        scv('100', 'string'),
        scv('1.5', 'string'),
        scv(true),
        xdr.ScVal.scvVoid(),
      ]) {
        for (const value of [
          vec(invalid, scv(1n, 'i128')),
          vec(scv(1n, 'i128'), invalid),
        ]) {
          expect(
            decodeVaultEvent(
              makeEvent({
                topic: [scv(kind, 'symbol'), scv(USER, 'address')],
                value,
              }),
            ),
          ).toBeNull();
        }
      }
    },
  );

  it.each(['deposit', 'withdraw', 'share_mint', 'share_burn'])(
    'rejects %s without an attributable user',
    (kind) => {
      const value = kind.startsWith('share_')
        ? scv(1n, 'i128')
        : vec(scv(1n, 'i128'), scv(1n, 'i128'));
      for (const topic of [
        [scv(kind, 'symbol')],
        [scv(kind, 'symbol'), scv(1, 'u32')],
      ]) {
        expect(decodeVaultEvent(makeEvent({ topic, value }))).toBeNull();
      }
    },
  );

  it.each(['share_mint', 'share_burn'])(
    'rejects %s without a scalar integer share amount',
    (kind) => {
      for (const value of [
        scv('100', 'string'),
        scv(true),
        vec(scv(1n, 'i128')),
        xdr.ScVal.scvVoid(),
      ]) {
        expect(
          decodeVaultEvent(
            makeEvent({
              topic: [scv(kind, 'symbol'), scv(USER, 'address')],
              value,
            }),
          ),
        ).toBeNull();
      }
    },
  );

  it('rejects malformed yield tuples', () => {
    for (const value of [
      vec(),
      vec(scv(1n, 'i128')),
      vec(scv(1n, 'i128'), scv(1n, 'u64'), scv(2n, 'i128')),
      vec(scv('1.5', 'string'), scv(1n, 'u64')),
      vec(scv(1n, 'i128'), scv('later', 'string')),
    ]) {
      expect(
        decodeVaultEvent(makeEvent({ topic: [scv('yield', 'symbol')], value })),
      ).toBeNull();
    }
  });

  it('preserves valid zero amounts', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: depositTopic,
        value: vec(scv(0n, 'i128'), scv(0n, 'i128')),
      }),
    );

    expect(decoded?.assets).toBe(0n);
    expect(decoded?.shares).toBe(0n);
  });

  it('carries ledger, transaction hash and close time through', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: depositTopic,
        value: vec(scv(1n, 'i128'), scv(1n, 'i128')),
        ledger: 4242,
        txHash: 'cafebabe',
      }),
    );

    expect(decoded?.ledger).toBe(4242);
    expect(decoded?.txHash).toBe('cafebabe');
    expect(decoded?.ledgerClosedAt).toBe('2026-01-01T00:00:00Z');
    expect(decoded?.eventId).toBe('0000001000-0000000001');
  });

  it('ignores events whose first topic is not a vault event', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('transfer', 'symbol'), scv(USER, 'address')],
        value: scv(10n, 'i128'),
      }),
    );

    expect(decoded).toBeNull();
  });

  it('ignores events with no topics, or with no contract id', () => {
    expect(decodeVaultEvent(makeEvent({ topic: [] }))).toBeNull();
    expect(
      decodeVaultEvent(
        makeEvent({
          contractId: null,
          topic: depositTopic,
        }),
      ),
    ).toBeNull();
  });

  it('ignores an event whose topic cannot be decoded', () => {
    const decoded = decodeVaultEvent(
      makeEvent({ topic: [undefined as unknown as xdr.ScVal] }),
    );

    expect(decoded).toBeNull();
  });

  it('skips initialization that is missing required metadata', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('initialize', 'symbol')],
        value: vec(scv(ADMIN, 'address'), scv(CONTRACT_ID, 'address')),
      }),
    );

    expect(decoded).toBeNull();
  });

  it('treats a non-boolean simulation flag as false rather than truthy', () => {
    const decoded = decodeVaultEvent(
      makeEvent({
        topic: [scv('initialize', 'symbol')],
        value: vec(
          scv(ADMIN, 'address'),
          scv(CONTRACT_ID, 'address'),
          scv('Vault', 'string'),
          scv('V', 'string'),
          scv(6, 'u32'),
          scv('yes', 'string'),
        ),
      }),
    );

    expect(decoded?.vault?.simulatedYield).toBe(false);
  });
});
