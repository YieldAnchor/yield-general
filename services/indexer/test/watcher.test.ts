import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { INDEXER_DEFAULTS } from '@yieldanchor/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEventsRequest,
  EVENTS_STREAM,
  resolveStartCursor,
  startWatcher,
} from '../src/watcher.js';

const mocks = vi.hoisted(() => ({
  hasDatabase: false,
  startLedger: null as number | null,
  getEvents: vi.fn(),
  getLatestLedger: vi.fn(),
  loadCheckpoint: vi.fn(),
  saveCheckpoint: vi.fn(),
  insertVaultEvents: vi.fn(),
  upsertVault: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: vi.fn(function () {
    return {
      getEvents: mocks.getEvents,
      getLatestLedger: mocks.getLatestLedger,
    };
  }),
}));

vi.mock('../src/config.js', () => ({
  loadConfig: () => ({
    contractId: CONTRACT,
    rpcUrl: 'https://rpc.invalid',
    supabaseUrl: null,
    supabaseKey: null,
    startLedger: mocks.startLedger,
  }),
  createSupabaseClient: () =>
    mocks.hasDatabase
      ? { from: () => ({ insert: async () => ({ error: null }) }) }
      : null,
}));

vi.mock('../src/checkpoints/checkpoint-store.js', () => ({
  loadCheckpoint: mocks.loadCheckpoint,
  saveCheckpoint: mocks.saveCheckpoint,
}));

vi.mock('../src/repositories/vault-repository.js', () => ({
  insertVaultEvents: mocks.insertVaultEvents,
  upsertVault: mocks.upsertVault,
}));

const CONTRACT = 'CB4RKPI55DQOZUPQGVOO4ZUGZ7EPVUZZTR6D7F7F7CYM5OFWOMC3J2IA';

describe('buildEventsRequest', () => {
  it('starts from an explicit ledger when there is no cursor', () => {
    const request = buildEventsRequest(null, 4_706_400, CONTRACT);

    expect(request).toEqual({
      startLedger: 4_706_400,
      filters: [
        { type: INDEXER_DEFAULTS.contractEventType, contractIds: [CONTRACT] },
      ],
      limit: INDEXER_DEFAULTS.pageLimit,
    });
  });

  it('never falls back to the "now" cursor the RPC rejects', () => {
    // The previous cold start sent `cursor: 'now'`, which the Soroban RPC
    // answers with `invalid event id now`. A regression here means a fresh
    // indexer silently ingests nothing.
    const request = buildEventsRequest(null, 4_706_400, CONTRACT);

    expect(request).not.toHaveProperty('cursor');
    expect(JSON.stringify(request)).not.toContain('now');
    expect(request.startLedger).toBe(4_706_400);
  });

  it('pages from the cursor once one exists', () => {
    const request = buildEventsRequest(
      '000004706400-00001',
      4_706_400,
      CONTRACT,
    );

    expect(request).toEqual({
      cursor: '000004706400-00001',
      filters: [
        { type: INDEXER_DEFAULTS.contractEventType, contractIds: [CONTRACT] },
      ],
      limit: INDEXER_DEFAULTS.pageLimit,
    });
    // cursor and startLedger are mutually exclusive on the RPC.
    expect(request).not.toHaveProperty('startLedger');
  });

  it('always scopes the query to the observed contract', () => {
    for (const cursor of [null, 'page-2']) {
      const request = buildEventsRequest(cursor, 1, CONTRACT);
      expect(request.filters).toHaveLength(1);
      expect(request.filters[0]?.contractIds).toEqual([CONTRACT]);
      expect(request.filters[0]?.type).toBe('contract');
    }
  });
});

describe('resolveStartCursor', () => {
  it('prefers a stored checkpoint over any configured start ledger', () => {
    const checkpoint = { cursor: 'cp-001', lastLedger: 12345 };
    const resolved = resolveStartCursor(checkpoint, 99999, 50000);

    expect(resolved).toEqual({
      cursor: 'cp-001',
      startLedger: 12345,
      source: 'checkpoint',
    });
  });

  it('uses configured start ledger when no checkpoint is present', () => {
    const resolved = resolveStartCursor(null, 4_700_000, 4_800_000);

    expect(resolved).toEqual({
      cursor: null,
      startLedger: 4_700_000,
      source: 'configured',
    });
  });

  it('falls back to the ledger tip when neither checkpoint nor configured ledger exists', () => {
    const resolved = resolveStartCursor(null, null, 4_800_000);

    expect(resolved).toEqual({
      cursor: null,
      startLedger: 4_800_000,
      source: 'tip',
    });
  });
});

describe('EVENTS_STREAM', () => {
  it('names the vault event stream', () => {
    expect(EVENTS_STREAM).toBe('yield_vault_events');
  });
});

describe('watcher persistence logging and start ledger resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.hasDatabase = false;
    mocks.startLedger = null;
    mocks.loadCheckpoint.mockResolvedValue(null);
    mocks.saveCheckpoint.mockResolvedValue(undefined);
    mocks.insertVaultEvents.mockResolvedValue(undefined);
    mocks.getLatestLedger.mockResolvedValue({ sequence: 100 });
    mocks.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'next-page',
      events: [
        {
          id: 'event-1',
          ledger: 100,
          txHash: 'local-test',
          contractId: { toString: () => CONTRACT },
          topic: [
            nativeToScVal('deposit', { type: 'symbol' }),
            nativeToScVal(Keypair.random().publicKey(), { type: 'address' }),
          ],
          value: xdr.ScVal.scvVec([
            nativeToScVal(1n, { type: 'i128' }),
            nativeToScVal(1n, { type: 'i128' }),
          ]),
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts from configured start ledger when no checkpoint is present', async () => {
    mocks.startLedger = 50;
    await startWatcher();

    expect(mocks.getLatestLedger).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'No checkpoint stored for yield_vault_events; starting from configured ledger 50.',
    );
    expect(mocks.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 50 }),
    );
  });

  it('starts from ledger tip when unconfigured and no checkpoint exists', async () => {
    mocks.startLedger = null;
    await startWatcher();

    expect(mocks.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      'No checkpoint stored for yield_vault_events; starting from ledger tip 100.',
    );
    expect(mocks.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 100 }),
    );
  });

  it('stored checkpoint overrides configured start ledger', async () => {
    mocks.startLedger = 50;
    mocks.loadCheckpoint.mockResolvedValue({
      cursor: 'existing-cursor',
      lastLedger: 80,
    });
    mocks.hasDatabase = true;

    await startWatcher();

    expect(mocks.getLatestLedger).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      'Resuming yield_vault_events from checkpoint cursor existing-cursor (last ledger 80).',
    );
    expect(mocks.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'existing-cursor' }),
    );
  });

  it('reports decoded but unpersisted events without a database', async () => {
    await startWatcher();

    expect(console.log).toHaveBeenCalledWith(
      'Decoded 1 vault event(s) through ledger 100 (not persisted: Supabase is not configured).',
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Persisted /),
    );
    expect(mocks.insertVaultEvents).not.toHaveBeenCalled();
    expect(mocks.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('retains the persisted message after a successful database write', async () => {
    mocks.hasDatabase = true;
    await startWatcher();

    expect(mocks.insertVaultEvents).toHaveBeenCalledTimes(1);
    expect(mocks.saveCheckpoint).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      'Persisted 1 vault event(s) through ledger 100.',
    );
  });

  it('does not report persistence after a rejected write', async () => {
    mocks.hasDatabase = true;
    mocks.insertVaultEvents.mockRejectedValue(new Error('write failed'));
    await startWatcher();

    expect(console.error).toHaveBeenCalledWith(
      'Poller error',
      expect.any(Error),
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Persisted /),
    );
    expect(mocks.saveCheckpoint).not.toHaveBeenCalled();
  });
});
