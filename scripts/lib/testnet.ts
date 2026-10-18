/**
 * Shared Testnet plumbing for the scripts under `scripts/`.
 *
 * Deployment and the live smoke test need the same three things — where the
 * repository is, who is paying, and how the deployer gets funded — so they live
 * here rather than being copied per script.
 *
 * Testnet only. Nothing here is safe for Mainnet: the friendbot fallback funds
 * accounts from a public faucet, and `loadDeployer` writes a secret key to disk.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Keypair, rpc } from '@stellar/stellar-sdk';

import {
  DEFAULT_SOROBAN_RPC_URLS,
  type StellarNetworkName,
} from '@yieldanchor/constants';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root, resolved from this file so callers cannot get it wrong. */
export const ROOT_DIR = resolve(LIB_DIR, '..', '..');

export const WASM_PATH = resolve(
  ROOT_DIR,
  'target/wasm32-unknown-unknown/release/yield_vault.wasm',
);
/** Testnet-only secret store. Gitignored; never read outside these scripts. */
export const KEY_FILE = resolve(ROOT_DIR, 'scripts', '.deployer.json');
/** Last deployment record written by `deploy-yield-vault.ts`. */
export const CONTRACT_ID_FILE = resolve(ROOT_DIR, 'scripts', '.contract_id');
/**
 * Creation salt of the last vault created, written before `initialize` so the
 * vault can still be initialized if that step fails or is done later.
 */
export const DEPLOY_SALT_FILE = resolve(ROOT_DIR, 'scripts', '.deploy_salt');

const DEFAULT_FRIEND_BOT = 'https://friendbot.stellar.org';

export interface Settings {
  network: StellarNetworkName;
  rpcUrl: string;
  name: string;
  symbol: string;
  decimals: number;
}

export function readSettings(): Settings {
  const network = (process.env.NETWORK ?? 'testnet') as StellarNetworkName;
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_SOROBAN_RPC_URLS[network];
  if (!rpcUrl) {
    throw new Error(
      `No default Soroban RPC URL for network "${network}"; set RPC_URL`,
    );
  }

  return {
    network,
    rpcUrl,
    name: process.env.VAULT_NAME ?? 'YieldAnchor Vault',
    symbol: process.env.VAULT_SYMBOL ?? 'yVAULT',
    decimals: Number(process.env.VAULT_DECIMALS ?? 7),
  };
}

/**
 * Load the deployer keypair, generating and persisting one on first use.
 *
 * `DEPLOYER_SECRET` takes precedence so CI can inject a key without a file on
 * disk. The generated fallback is written with 0600 permissions and is
 * gitignored; the secret is never printed.
 */
export function loadDeployer(): Keypair {
  const injected = process.env.DEPLOYER_SECRET;
  if (injected) {
    console.log('  using DEPLOYER_SECRET from the environment');
    return Keypair.fromSecret(injected);
  }

  if (existsSync(KEY_FILE)) {
    const stored = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as {
      secret: string;
    };
    console.log(`  using the persisted deployer in ${KEY_FILE}`);
    return Keypair.fromSecret(stored.secret);
  }

  const keypair = Keypair.random();
  writeFileSync(
    KEY_FILE,
    `${JSON.stringify({ publicKey: keypair.publicKey(), secret: keypair.secret() }, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(`  generated a new deployer, saved to ${KEY_FILE} (gitignored)`);
  return keypair;
}

/** Fund the deployer through Friendbot when the account does not exist yet. */
export async function ensureFunded(
  server: rpc.Server,
  keypair: Keypair,
): Promise<void> {
  const address = keypair.publicKey();
  try {
    await server.getAccount(address);
    console.log('  deployer account already exists on Testnet');
    return;
  } catch {
    console.log('  deployer account not found; requesting Friendbot funding');
  }

  const network = await server.getNetwork().catch(() => null);
  const friendbot = network?.friendbotUrl ?? DEFAULT_FRIEND_BOT;

  // Friendbot is a plain HTTP faucet and is not part of the RPC surface. It is
  // called through the SDK's HTTP client so these scripts add no HTTP
  // dependency of their own.
  try {
    const response = await server.httpClient.get(
      `${friendbot}?addr=${encodeURIComponent(address)}`,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Friendbot returned ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Friendbot funding failed for ${address}: ${(error as Error).message}`,
      { cause: error },
    );
  }

  // Friendbot returns as soon as the transaction is submitted, so poll until
  // the account is actually readable before building transactions from it.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await server.getAccount(address);
      console.log(`  funded: ${address}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error(`Friendbot did not fund ${address} in time`);
}

/** Read the contract id recorded by the last deployment. */
export function readRecordedContractId(): string | null {
  if (!existsSync(CONTRACT_ID_FILE)) {
    return null;
  }
  const match = /^CONTRACT_ID=(.+)$/m.exec(
    readFileSync(CONTRACT_ID_FILE, 'utf8'),
  );
  return match?.[1]?.trim() ?? null;
}
