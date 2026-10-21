import { DEFAULT_SOROBAN_RPC_URLS } from '@yieldanchor/constants';
import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { parseIndexerEnv } from '../src/index.js';

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));
const TESTNET_RPC = DEFAULT_SOROBAN_RPC_URLS.testnet ?? '';

describe('parseIndexerEnv', () => {
  it('falls back to the Testnet RPC and no vault when nothing is set', () => {
    const { config, issues } = parseIndexerEnv({});

    expect(config.rpcUrl).toBe(TESTNET_RPC);
    expect(config.contractId).toBe('');
    expect(config.supabaseUrl).toBeNull();
    expect(config.supabaseKey).toBeNull();
    expect(config.startLedger).toBeNull();
    expect(issues).toEqual([]);
  });

  it('treats .env.example placeholders as unconfigured', () => {
    const { config, issues } = parseIndexerEnv({
      SUPABASE_URL: 'your_supabase_url_here',
      SUPABASE_KEY: 'your_supabase_key_here',
    });

    expect(config.supabaseUrl).toBeNull();
    expect(config.supabaseKey).toBeNull();
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('SUPABASE_URL');
    expect(issues[0]).toContain('placeholder');
  });

  it('reads configured secrets', () => {
    const { config, issues } = parseIndexerEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'service-role-key',
    });

    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.supabaseKey).toBe('service-role-key');
    expect(issues).toEqual([]);
  });

  it('accepts a valid contract id', () => {
    const { config, issues } = parseIndexerEnv({ CONTRACT_ID: CONTRACT });

    expect(config.contractId).toBe(CONTRACT);
    expect(issues).toEqual([]);
  });

  it('reports a malformed contract id and leaves observation disabled', () => {
    const { config, issues } = parseIndexerEnv({ CONTRACT_ID: 'CABC' });

    expect(config.contractId).toBe('');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('CONTRACT_ID');
  });

  it('reports a malformed RPC URL and keeps the default', () => {
    const { config, issues } = parseIndexerEnv({ SOROBAN_RPC: 'not a url' });

    expect(config.rpcUrl).toBe(TESTNET_RPC);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('SOROBAN_RPC');
  });

  it('accepts a custom RPC URL', () => {
    const { config, issues } = parseIndexerEnv({
      SOROBAN_RPC: 'https://rpc.example.org:443',
    });

    expect(config.rpcUrl).toBe('https://rpc.example.org:443');
    expect(issues).toEqual([]);
  });

  it('parses valid INDEXER_START_LEDGER values', () => {
    expect(parseIndexerEnv({ INDEXER_START_LEDGER: '4706830' }).config.startLedger).toBe(4706830);
    expect(parseIndexerEnv({ INDEXER_START_LEDGER: '0' }).config.startLedger).toBe(0);
    expect(parseIndexerEnv({ INDEXER_START_LEDGER: ' 12345 ' }).config.startLedger).toBe(12345);
    expect(parseIndexerEnv({ INDEXER_START_LEDGER: '' }).config.startLedger).toBeNull();
    expect(parseIndexerEnv({ INDEXER_START_LEDGER: '   ' }).config.startLedger).toBeNull();
  });

  it('reports invalid INDEXER_START_LEDGER and falls back to null', () => {
    for (const bad of ['-1', 'abc', '12.34', '1e6']) {
      const { config, issues } = parseIndexerEnv({ INDEXER_START_LEDGER: bad });
      expect(config.startLedger).toBeNull();
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('INDEXER_START_LEDGER');
    }
  });
});
