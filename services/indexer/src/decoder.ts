import type { Api } from '@stellar/stellar-sdk/rpc';
import { isVaultEventTopic } from '@yieldanchor/constants';
import type {
  DecodedVaultEvent,
  VaultEventType,
  VaultMetadata,
} from '@yieldanchor/shared-types';
import {
  asBigInt,
  asItems,
  asSafeInteger,
  asString,
  scValToNativeSafe,
} from '@yieldanchor/stellar-utils';

/**
 * Decode the Phase 1 `YieldVault` contract's events into a projection-friendly
 * shape.
 *
 * The topic names, the event types, and the ScVal helpers all come from the
 * shared packages, so the wire format is defined once and checked against the
 * contract's source by their tests.
 *
 * The contract publishes:
 *
 * | topic | value |
 * | --- | --- |
 * | `initialize` | `(admin, asset, name, symbol, decimals, simulation)` |
 * | `deposit`, user | `(assets, shares)` |
 * | `withdraw`, user | `(assets, shares)` |
 * | `share_mint`, user | `shares` |
 * | `share_burn`, user | `shares` |
 * | `yield` | `(yield_amount, timestamp)` |
 * | `pause` | admin |
 * | `unpause` | admin |
 *
 * This is deliberately a decoder, not an interpreter: it performs no protocol
 * accounting and stores no derived balances. Positions are derived from the
 * append-only event log.
 */

export type { DecodedVaultEvent, VaultEventType, VaultMetadata };

/**
 * Decode one RPC event. Returns `null` for anything that is not a recognised
 * vault event, so unrelated events can never enter the projection.
 */
export function decodeVaultEvent(
  event: Api.EventResponse,
): DecodedVaultEvent | null {
  const vaultId = event.contractId?.toString() ?? null;
  if (!vaultId || event.topic.length === 0) {
    return null;
  }

  const topic = asString(scValToNativeSafe(event.topic[0]));
  if (!isVaultEventTopic(topic)) {
    return null;
  }

  const payload = scValToNativeSafe(event.value);
  const userAddress =
    event.topic.length > 1 ? asString(scValToNativeSafe(event.topic[1])) : null;

  let assets: bigint | null = null;
  let shares: bigint | null = null;
  let vault: VaultMetadata | null = null;

  switch (topic) {
    case 'deposit':
    case 'withdraw': {
      const values = asItems(payload);
      if (values.length !== 2 || !userAddress) {
        return null;
      }
      const [assetsValue, sharesValue] = values;
      assets = asBigInt(assetsValue);
      shares = asBigInt(sharesValue);
      if (assets === null || shares === null) {
        return null;
      }
      break;
    }
    case 'share_mint':
    case 'share_burn':
      shares = asBigInt(payload);
      if (shares === null || !userAddress) {
        return null;
      }
      break;
    case 'yield': {
      const values = asItems(payload);
      if (values.length !== 2 || asBigInt(values[1]) === null) {
        return null;
      }
      const [yieldAmount] = values;
      assets = asBigInt(yieldAmount);
      if (assets === null) {
        return null;
      }
      break;
    }
    case 'initialize': {
      const [admin, asset, name, symbol, decimals, simulation] =
        asItems(payload);
      const adminAddress = asString(admin);
      const assetAddress = asString(asset);
      const vaultName = asString(name);
      const vaultSymbol = asString(symbol);
      const vaultDecimals = asSafeInteger(decimals);
      if (
        !adminAddress ||
        !assetAddress ||
        !vaultName ||
        !vaultSymbol ||
        vaultDecimals === null
      ) {
        // Incomplete metadata: skip rather than write a misleading vault row.
        return null;
      }
      vault = {
        contractId: vaultId,
        admin: adminAddress,
        asset: assetAddress,
        name: vaultName,
        symbol: vaultSymbol,
        decimals: vaultDecimals,
        simulatedYield: simulation === true,
      };
      break;
    }
    case 'pause':
    case 'unpause':
      // The value is the admin address; authorization is already enforced
      // on-chain, so nothing further is projected here.
      break;
  }

  return {
    eventId: event.id,
    vaultId,
    eventType: topic,
    userAddress,
    assets,
    shares,
    ledger: event.ledger,
    txHash: event.txHash,
    ledgerClosedAt: event.ledgerClosedAt ?? null,
    vault,
  };
}
