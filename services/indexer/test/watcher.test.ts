import { INDEXER_DEFAULTS } from '@yieldanchor/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEventsRequest,
  EVENTS_STREAM,
  startWatcher,
} from '../src/watcher.js';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  getEvents: vi.fn(),
  getLatestLedger: vi.fn(),
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

vi.mock('../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config.js')>();
  return {
    ...actual,
    loadConfig: () => actual.loadConfig(mocks.env),
    createSupabaseClient: () => ({
      from: () => ({ insert: async () => ({ error: null }) }),
    }),
  };
});

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

describe('startWatcher ledger selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.env = { CONTRACT_ID: CONTRACT };
    mocks.loadCheckpoint.mockResolvedValue(null);
    mocks.saveCheckpoint.mockResolvedValue(undefined);
    mocks.getLatestLedger.mockResolvedValue({ sequence: 4_707_000 });
    mocks.getEvents.mockResolvedValue({
      events: [],
      cursor: 'next-page',
      latestLedger: 4_707_000,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([0, 4_706_400])(
    'starts a fresh indexer at configured ledger %s',
    async (startLedger) => {
      mocks.env.INDEXER_START_LEDGER = String(startLedger);

      await startWatcher();

      expect(mocks.getLatestLedger).not.toHaveBeenCalled();
      expect(mocks.getEvents).toHaveBeenCalledWith(
        buildEventsRequest(null, startLedger, CONTRACT),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`configured ledger ${startLedger}`),
      );
    },
  );

  it.each([0, 4_706_401])(
    'keeps the saved checkpoint ahead of configured ledger %s',
    async (startLedger) => {
      mocks.env.INDEXER_START_LEDGER = String(startLedger);
      mocks.loadCheckpoint.mockResolvedValue({
        stream: EVENTS_STREAM,
        cursor: 'saved-cursor',
        lastLedger: 4_706_400,
      });

      await startWatcher();

      expect(mocks.getLatestLedger).not.toHaveBeenCalled();
      expect(mocks.getEvents).toHaveBeenCalledWith(
        buildEventsRequest('saved-cursor', 4_706_400, CONTRACT),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('checkpoint'),
      );
    },
  );

  it('uses and identifies the ledger tip when the option is unset', async () => {
    await startWatcher();

    expect(mocks.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(mocks.getEvents).toHaveBeenCalledWith(
      buildEventsRequest(null, 4_707_000, CONTRACT),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('ledger tip'),
    );
  });

  it('reports an invalid configured ledger and falls back to the tip', async () => {
    mocks.env.INDEXER_START_LEDGER = '-1';

    await startWatcher();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('INDEXER_START_LEDGER'),
    );
    expect(mocks.getEvents).toHaveBeenCalledWith(
      buildEventsRequest(null, 4_707_000, CONTRACT),
    );
  });

  it('uses the response cursor after the configured first page', async () => {
    mocks.env.INDEXER_START_LEDGER = '4706400';

    await startWatcher();
    await vi.advanceTimersByTimeAsync(INDEXER_DEFAULTS.pollIntervalMs);

    expect(mocks.getEvents).toHaveBeenNthCalledWith(
      1,
      buildEventsRequest(null, 4_706_400, CONTRACT),
    );
    expect(mocks.getEvents).toHaveBeenNthCalledWith(
      2,
      buildEventsRequest('next-page', 4_707_000, CONTRACT),
    );
  });
});
