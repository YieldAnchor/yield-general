import type { SupabaseClient } from '@supabase/supabase-js';
import { Server, type Api } from '@stellar/stellar-sdk/rpc';
import {
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
  let cursor: string | null = checkpoint?.cursor ?? null;
  let lastLedger = checkpoint?.lastLedger ?? 0;

  if (checkpoint) {
    console.log(
      `Resuming ${EVENTS_STREAM} from cursor ${cursor} (last ledger ${lastLedger}).`,
    );
  } else {
    // With no checkpoint there is nothing to page from, so anchor on the
    // ledger tip. `lastLedger` doubles as the first request's `startLedger`.
    lastLedger = (await server.getLatestLedger()).sequence;
    console.log(
      `No checkpoint stored for ${EVENTS_STREAM}; starting from ledger ${lastLedger}.`,
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
          `Persisted ${decoded.length} vault event(s) through ledger ${observedLedger}.`,
        );
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
