import {
  DEFAULT_SOROBAN_RPC_URLS,
  PLACEHOLDER_ENV_VALUES,
} from '@yieldanchor/constants';
import { isValidContractId } from '@yieldanchor/stellar-utils';
import { z } from 'zod';

/**
 * Environment configuration parsing.
 *
 * The services must boot with a missing or placeholder `.env`: the indexer
 * degrades to observation-only when Supabase is not configured, and it must not
 * crash on a value someone forgot to fill in. So an invalid value is reported
 * and replaced with the documented default rather than thrown — which is why
 * this returns `issues` alongside the resolved config instead of a bare parse
 * result.
 */

/** Anything `process.env`-shaped, without depending on Node's types. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

const placeholders = new Set<string>(PLACEHOLDER_ENV_VALUES);

/** A secret that is absent, empty, or still a `.env.example` placeholder. */
export const configuredSecretSchema = z
  .string()
  .trim()
  .min(1, 'Value is empty')
  .refine(
    (value) => !placeholders.has(value),
    'Value is still the .env.example placeholder',
  );

/** A contract id, or the empty string meaning "not configured yet". */
export const optionalContractIdSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || isValidContractId(value),
    'Not a valid Soroban contract id',
  );

export const sorobanRpcUrlSchema = z.string().trim().url('Not a valid URL');

const startLedgerSchema = z.coerce.number().int().nonnegative().safe();

export interface IndexerEnvConfig {
  rpcUrl: string;
  contractId: string;
  startLedger: number | null;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}

export interface IndexerEnvResult {
  config: IndexerEnvConfig;
  /** Human-readable problems; each one fell back to the default. */
  issues: string[];
}

function resolve<T>(
  schema: z.ZodType<T>,
  raw: string | undefined,
  fallback: T,
  label: string,
  issues: string[],
): T {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = schema.safeParse(raw.trim());
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    issues.push(`${label}: ${first?.message ?? 'invalid value'}`);
    return fallback;
  }
  return parsed.data;
}

/**
 * Resolve indexer configuration, reporting problems instead of throwing.
 *
 * Never throws, so a malformed `.env` cannot stop the service from starting;
 * the affected setting falls back to its default.
 */
export function parseIndexerEnv(env: EnvLike = {}): IndexerEnvResult {
  const issues: string[] = [];
  const defaultRpcUrl = DEFAULT_SOROBAN_RPC_URLS.testnet;
  if (defaultRpcUrl === null) {
    throw new Error('No default Testnet Soroban RPC URL is configured');
  }

  return {
    config: {
      rpcUrl: resolve(
        sorobanRpcUrlSchema,
        env.SOROBAN_RPC,
        defaultRpcUrl,
        'SOROBAN_RPC',
        issues,
      ),
      contractId: resolve(
        optionalContractIdSchema,
        env.CONTRACT_ID,
        '',
        'CONTRACT_ID',
        issues,
      ),
      startLedger: resolve(
        startLedgerSchema,
        env.INDEXER_START_LEDGER,
        null,
        'INDEXER_START_LEDGER',
        issues,
      ),
      supabaseUrl: resolve(
        configuredSecretSchema,
        env.SUPABASE_URL,
        null,
        'SUPABASE_URL',
        issues,
      ),
      supabaseKey: resolve(
        configuredSecretSchema,
        env.SUPABASE_KEY,
        null,
        'SUPABASE_KEY',
        issues,
      ),
    },
    issues,
  };
}
