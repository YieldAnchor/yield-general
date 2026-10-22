import type { SupabaseClient } from '@supabase/supabase-js';
import { DATABASE_TABLES } from '@yieldanchor/constants';
import type {
  DecodedVaultEvent,
  VaultMetadata,
} from '@yieldanchor/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadCheckpoint,
  saveCheckpoint,
} from '../src/checkpoints/checkpoint-store.js';
import { createSupabaseClient, loadConfig } from '../src/config.js';
import {
  insertVaultEvents,
  upsertVault,
} from '../src/repositories/vault-repository.js';
import { projectEvents } from '../src/watcher.js';

const I128_MAX = 170141183460469231731687303715884105727n;

/**
 * Database-backed integration tier for indexer projection and checkpoint resume.
 *
 * Skips execution when Supabase persistence is not configured. Standard `pnpm test`
 * runs remain hermetic and require no running database.
 */
const config = loadConfig();
const supabase = createSupabaseClient(config);

describe.skipIf(supabase === null)(
  'indexer database-backed integration',
  () => {
    const client: SupabaseClient = supabase!;

    const TEST_VAULT_ID = 'C_INTEGRATION_TEST_VAULT';
    const ORPHAN_VAULT_ID = 'C_UNKNOWN_UNREGISTERED_VAULT';
    const STREAM_NAME = 'integration-test-stream';
    const OVERFLOW_STREAM_NAME = 'integration-overflow-stream';

    async function cleanTestData(): Promise<void> {
      await client
        .from(DATABASE_TABLES.vaultEvents)
        .delete()
        .in('vault_id', [TEST_VAULT_ID, ORPHAN_VAULT_ID]);

      await client
        .from(DATABASE_TABLES.vaults)
        .delete()
        .eq('contract_id', TEST_VAULT_ID);

      await client
        .from(DATABASE_TABLES.indexerCheckpoints)
        .delete()
        .in('stream', [STREAM_NAME, OVERFLOW_STREAM_NAME]);
    }

    beforeEach(async () => {
      await cleanTestData();
    });

    afterEach(async () => {
      await cleanTestData();
    });

    const VAULT: VaultMetadata = {
      contractId: TEST_VAULT_ID,
      admin: 'G_TEST_ADMIN',
      asset: 'G_TEST_ASSET',
      name: 'Integration Test Vault',
      symbol: 'yTEST',
      decimals: 6,
      simulatedYield: true,
    };

    function testEvent(
      overrides: Partial<DecodedVaultEvent> = {},
    ): DecodedVaultEvent {
      return {
        eventId: 'evt-integration-1',
        vaultId: TEST_VAULT_ID,
        eventType: 'deposit',
        userAddress: 'G_USER_TEST',
        assets: I128_MAX,
        shares: I128_MAX,
        ledger: 1000,
        txHash: 'hash-integration-1',
        ledgerClosedAt: '2026-01-01T00:00:00Z',
        vault: null,
        ...overrides,
      };
    }

    it('applies idempotent event replay and preserves 128-bit decimal precision', async () => {
      const event = testEvent({ eventId: 'dedup-test-event-1' });
      const firstInsert = await insertVaultEvents(client, [event]);
      expect(firstInsert).toBe(1);

      // Replaying identical event id must ignore duplicates and preserve row count
      const secondInsert = await insertVaultEvents(client, [event]);
      expect(secondInsert).toBe(1);

      const { data, error } = await client
        .from(DATABASE_TABLES.vaultEvents)
        .select('event_id, assets, shares')
        .eq('event_id', 'dedup-test-event-1');

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.event_id).toBe('dedup-test-event-1');
      expect(data?.[0]?.assets).toBe('170141183460469231731687303715884105727');
      expect(data?.[0]?.shares).toBe('170141183460469231731687303715884105727');
    });

    it('upserts vault metadata into the vaults table', async () => {
      await upsertVault(client, VAULT, 1000);
      const { data } = await client
        .from(DATABASE_TABLES.vaults)
        .select('contract_id, admin, asset, name, symbol, decimals')
        .eq('contract_id', VAULT.contractId)
        .maybeSingle();

      expect(data?.contract_id).toBe(VAULT.contractId);
      expect(data?.symbol).toBe('yTEST');
    });

    it('maintains coherence when a batch contains both initialize and deposit', async () => {
      const initEvent: DecodedVaultEvent = {
        eventId: 'init-evt-1',
        vaultId: VAULT.contractId,
        eventType: 'initialize',
        userAddress: null,
        assets: null,
        shares: null,
        ledger: 500,
        txHash: 'init-hash',
        ledgerClosedAt: '2026-01-01T00:00:00Z',
        vault: VAULT,
      };
      const depositEvent = testEvent({
        eventId: 'deposit-evt-1',
        vaultId: VAULT.contractId,
        ledger: 501,
      });

      await projectEvents(client, [initEvent, depositEvent]);

      const { data: vaultData } = await client
        .from(DATABASE_TABLES.vaults)
        .select('contract_id, symbol')
        .eq('contract_id', VAULT.contractId)
        .maybeSingle();
      expect(vaultData?.contract_id).toBe(VAULT.contractId);

      const { data: eventData } = await client
        .from(DATABASE_TABLES.vaultEvents)
        .select('event_id')
        .eq('vault_id', VAULT.contractId);
      expect(eventData?.map((r: { event_id: string }) => r.event_id)).toContain(
        'init-evt-1',
      );
      expect(eventData?.map((r: { event_id: string }) => r.event_id)).toContain(
        'deposit-evt-1',
      );
    });

    it('permits events arriving before vault metadata (relaxed foreign key)', async () => {
      const orphanEvent = testEvent({
        eventId: 'orphan-evt-1',
        vaultId: ORPHAN_VAULT_ID,
      });
      const inserted = await insertVaultEvents(client, [orphanEvent]);
      expect(inserted).toBe(1);

      const { data } = await client
        .from(DATABASE_TABLES.vaultEvents)
        .select('event_id, vault_id')
        .eq('event_id', 'orphan-evt-1')
        .maybeSingle();
      expect(data?.vault_id).toBe(ORPHAN_VAULT_ID);
    });

    it('round-trips checkpoints through the database including Number.MAX_SAFE_INTEGER', async () => {
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991

      await saveCheckpoint(client, {
        stream: STREAM_NAME,
        cursor: 'cursor-max-safe',
        lastLedger: maxSafe,
      });

      const loaded = await loadCheckpoint(client, STREAM_NAME);
      expect(loaded).toEqual({
        stream: STREAM_NAME,
        cursor: 'cursor-max-safe',
        lastLedger: maxSafe,
      });
    });

    it('narrows out-of-range last_ledger values to zero', async () => {
      // Insert a checkpoint row whose numeric last_ledger exceeds Number.MAX_SAFE_INTEGER
      await client.from(DATABASE_TABLES.indexerCheckpoints).upsert({
        stream: OVERFLOW_STREAM_NAME,
        cursor: 'cursor-overflow',
        last_ledger: '9007199254740993',
        updated_at: new Date().toISOString(),
      });

      const loaded = await loadCheckpoint(client, OVERFLOW_STREAM_NAME);
      expect(loaded?.stream).toBe(OVERFLOW_STREAM_NAME);
      expect(loaded?.cursor).toBe('cursor-overflow');
      expect(loaded?.lastLedger).toBe(0);
    });
  },
);
