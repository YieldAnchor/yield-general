import { DATABASE_TABLES, INDEXER_DEFAULTS } from '@yieldanchor/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEventsRequest,
  EVENTS_STREAM,
  startWatcher,
} from '../src/watcher.js';

const mocks = vi.hoisted(() => ({
  getEvents: vi.fn(),
  getLatestLedger: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  loadCheckpoint: vi.fn(),
  saveCheckpoint: vi.fn(),
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
  loadConfig: () => ({ contractId: CONTRACT, rpcUrl: 'https://rpc.invalid' }),
  createSupabaseClient: () => ({ from: mocks.from }),
}));

vi.mock('../src/checkpoints/checkpoint-store.js', () => ({
  loadCheckpoint: mocks.loadCheckpoint,
  saveCheckpoint: mocks.saveCheckpoint,
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

describe('EVENTS_STREAM', () => {
  it('names the vault event stream', () => {
    expect(EVENTS_STREAM).toBe('yield_vault_events');
  });
});

describe('startWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mocks.loadCheckpoint.mockResolvedValue(null);
    mocks.saveCheckpoint.mockResolvedValue(undefined);
    mocks.getLatestLedger.mockResolvedValue({ sequence: 100 });
    mocks.getEvents.mockResolvedValue({
      events: [],
      cursor: 'after-empty-page',
      latestLedger: 100,
    });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('never writes fabricated pool measurements during initial or repeated polls', async () => {
    await startWatcher();
    await vi.advanceTimersByTimeAsync(INDEXER_DEFAULTS.pollIntervalMs);

    expect(mocks.getEvents).toHaveBeenCalledTimes(2);
    expect(mocks.saveCheckpoint).toHaveBeenCalledWith(expect.anything(), {
      stream: EVENTS_STREAM,
      cursor: 'after-empty-page',
      lastLedger: 100,
    });
    expect(mocks.from).not.toHaveBeenCalledWith(DATABASE_TABLES.poolSnapshots);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
