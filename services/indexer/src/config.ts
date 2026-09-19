import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseIndexerEnv, type EnvLike } from '@yieldanchor/validation';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Indexer configuration.
 *
 * Resolution lives in `@yieldanchor/validation` so the fallbacks (Testnet RPC,
 * "no vault yet", placeholder secrets treated as unconfigured) are tested
 * there rather than re-implemented per service. An invalid value is reported
 * and falls back to its default: a malformed `.env` must not stop the indexer
 * from starting.
 */

export interface IndexerConfig {
  rpcUrl: string;
  contractId: string;
  startLedger: number | null;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}

/**
 * Read indexer configuration from an environment-like object.
 *
 * Taking the environment as an argument keeps this testable without mutating
 * `process.env` globally.
 */
export function loadConfig(env: EnvLike = process.env): IndexerConfig {
  const { config, issues } = parseIndexerEnv(env);

  for (const issue of issues) {
    console.warn(`Indexer configuration: ${issue} (using the default)`);
  }

  return config;
}

/**
 * Create a Supabase client, or return `null` when persistence is not
 * configured. The indexer degrades to observation-only in that case.
 */
export function createSupabaseClient(
  config: IndexerConfig,
): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseKey) {
    return null;
  }
  return createClient(config.supabaseUrl, config.supabaseKey);
}
