import type { SupabaseClient } from '@supabase/supabase-js';
import { Server, type Api } from '@stellar/stellar-sdk/rpc';
import {
  DATABASE_TABLES,
  INDEXER_DEFAULTS,
  INDEXER_EVENTS_STREAM,
} from '@yieldanchor/constants';
import type { DecodedVaultEvent } from '@yieldanchor/shared-types';

import {
  loadCheckpoint,
  saveCheckpoint,
} from './checkpoints/checkpoint-store.js';
import { createSupabaseClient, loadConfig } from './config.js';
import { decodeVaultEvent } from './decoder.js';
import {
  insertVaultEvents,
  upsertVault,
} from './repositories/vault-repository.js';

const POLL_INTERVAL_MS = INDEXER_DEFAULTS.pollIntervalMs;
const PAGE_LIMIT = INDEXER_DEFAULTS.pageLimit;

/** Checkpoint stream id for the observed vault's event log. */
export const EVENTS_STREAM = INDEXER_EVENTS_STREAM;

export type StartLedgerSource = 'checkpoint' | 'configured' | 'tip';

export interface ResolvedStartCursor {
  cursor: string | null;
  startLedger: number;
  source: StartLedgerSource;
}

/**
 * Determine the initial cursor and starting ledger for the indexer.
 *
 * Precedence:
 * 1. Stored checkpoint wins if present, so a running indexer is never rewound
 *    by configuration.
 * 2. Explicit `INDEXER_START_LEDGER` if configured on cold start.
 * 3. Current ledger tip as default fallback.
 */
export function resolveStartCursor(
  checkpoint: { cursor: string | null; lastLedger: number } | null,
  configuredStartLedger: number | null,
  tipLedger: number,
): ResolvedStartCursor {
  if (checkpoint) {
    return {
      cursor: checkpoint.cursor,
      startLedger: checkpoint.lastLedger,
      source: 'checkpoint',
    };
  }
  if (configuredStartLedger !== null) {
    return {
      cursor: null,
      startLedger: configuredStartLedger,
      source: 'configured',
    };
  }
  return {
    cursor: null,
    startLedger: tipLedger,
    source: 'tip',
  };
}

/**
 * Build a `getEvents` request for either the first or a subsequent page.
 *
 * `cursor` and `startLedger` are mutually exclusive on the RPC. A cold start has
 * no cursor to resume from, and there is no "from the tip" cursor: the previous
 * code passed the literal `'now'`, which the RPC rejects with `invalid event id
 * now`, so a fresh indexer ingested nothing at all. It starts from an explicit
 * ledger instead.
 */
export function buildEventsRequest(
  cursor: string | null,
  startLedger: number,
  contractId: string,
): Api.GetEventsRequest {
  const filters = [
    {
      type: INDEXER_DEFAULTS.contractEventType,
      contractIds: [contractId],
    },
  ];

  return cursor === null
    ? { startLedger, filters, limit: PAGE_LIMIT }
    : { cursor, filters, limit: PAGE_LIMIT };
}

/**
 * Persist a decoded batch.
 *
 * `initialize` creates the vault metadata row, so those are applied before the
 * event rows to keep a batch that contains both of them coherent.
 */
async function projectEvents(
  supabase: SupabaseClient,
  events: DecodedVaultEvent[],
): Promise<void> {
  for (const event of events) {
    if (event.vault) {
      await upsertVault(supabase, event.vault, event.ledger);
    }
  }
  await insertVaultEvents(supabase, events);
}

/**
 * Scaffold-only behaviour retained from the Phase 0 poller: the read API and
 * web dashboard still consume `pool_snapshots`. Replacing this with real vault
 * state requires contract state reads, which are Phase 5 work.
 */
async function recordScaffoldSnapshot(supabase: SupabaseClient): Promise<void> {
  const tvl = Math.floor(Math.random() * 10_000_000) / 100;
  const dynamicApy = (5 + Math.random() * 5).toFixed(2);
  await supabase.from(DATABASE_TABLES.poolSnapshots).insert([
    {
      tvl,
      dynamic_apy: Number(dynamicApy),
      timestamp: new Date().toISOString(),
    },
  ]);
}

export async function startWatcher(): Promise<void> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);
  const server = new Server(config.rpcUrl);

  if (!config.contractId) {
    console.warn(
      'CONTRACT_ID is not configured; there is nothing to observe. Set it in .env after deploying the contract.',
    );
    return;
  }

  if (!supabase) {
    console.warn(
      'Supabase is not configured; the indexer will observe events without persisting them.',
    );
  }

  const checkpoint = supabase
    ? await loadCheckpoint(supabase, EVENTS_STREAM)
    : null;

  let tipLedger = 0;
  if (!checkpoint && config.startLedger === null) {
    tipLedger = (await server.getLatestLedger()).sequence;
  }
  const start = resolveStartCursor(checkpoint, config.startLedger, tipLedger);

  let cursor: string | null = start.cursor;
  let lastLedger = start.startLedger;

  if (start.source === 'checkpoint') {
    console.log(
      `Resuming ${EVENTS_STREAM} from checkpoint cursor ${cursor} (last ledger ${lastLedger}).`,
    );
  } else if (start.source === 'configured') {
    console.log(
      `No checkpoint stored for ${EVENTS_STREAM}; starting from configured ledger ${lastLedger}.`,
    );
  } else {
    console.log(
      `No checkpoint stored for ${EVENTS_STREAM}; starting from ledger tip ${lastLedger}.`,
    );
  }

  let inFlight = false;

  const poll = async (): Promise<void> => {
    // Guard against overlapping runs: two concurrent polls would race the
    // cursor and could write events out of order.
    if (inFlight) {
      return;
    }
    inFlight = true;

    try {
      const response = await server.getEvents(
        buildEventsRequest(cursor, lastLedger, config.contractId),
      );

      const decoded = response.events
        .map(decodeVaultEvent)
        .filter((event): event is DecodedVaultEvent => event !== null);

      if (decoded.length > 0 && supabase) {
        await projectEvents(supabase, decoded);
      }

      const batchMaxLedger = decoded.reduce(
        (max, event) => Math.max(max, event.ledger),
        lastLedger,
      );
      const observedLedger = Math.max(
        batchMaxLedger,
        response.latestLedger ?? 0,
      );

      if (response.cursor && response.cursor !== cursor) {
        cursor = response.cursor;
        if (supabase) {
          await saveCheckpoint(supabase, {
            stream: EVENTS_STREAM,
            cursor,
            lastLedger: observedLedger,
          });
        }
      }
      lastLedger = observedLedger;

      if (decoded.length > 0) {
        console.log(
          `${supabase ? 'Persisted' : 'Decoded'} ${decoded.length} vault event(s) through ledger ${observedLedger}${supabase ? '.' : ' (not persisted: Supabase is not configured).'}`,
        );
      }

      if (supabase) {
        await recordScaffoldSnapshot(supabase);
      }
    } catch (error) {
      console.error('Poller error', error);
    } finally {
      inFlight = false;
    }
  };

  await poll();
  setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}
