#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# YieldAnchor Protocol — Soroban Contract Deployment Script
# -----------------------------------------------------------------
# This script compiles the Rust yield_vault contract, deploys it to
# Stellar Testnet, initializes it, and echoes the Contract ID so the
# indexer can pick it up via the CONTRACT_ID env variable.
#
# Prerequisites:
#   1. Rust toolchain (wasm32-unknown-unknown target) installed
#   2. stellar-cli v21+ installed and in PATH
#   3. A funded Stellar Testnet account configured in your local
#      stellar-cli identity store (run: stellar keys generate --global deployer --network testnet)
#   4. The asset (token) contract ID you want the vault to accept
###############################################################################

# ─── Configuration ───────────────────────────────────────────────────────────
NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org:443"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# The identity that will sign the deploy + init transactions.
# Ensure this identity is funded on testnet (at least ~10 XLM for fees).
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-deployer}"

# The Stellar asset contract address (e.g. native SAC-wrapped USDC on testnet)
# that depositors will supply to the vault. Replace with your actual token.
# NOTE: Must be a valid Stellar address (G... for accounts, C... for contracts).
ASSET_CONTRACT_ID="${ASSET_CONTRACT_ID:-GDDB57WR5G7IVSLVKLIH5DBOAIQAPV4EEGCDFBDAHM7GQ4EPJKEM7L2F}"

# Admin address (the Stellar account that manages the vault)
ADMIN_ADDRESS="${ADMIN_ADDRESS:-GDDB57WR5G7IVSLVKLIH5DBOAIQAPV4EEGCDFBDAHM7GQ4EPJKEM7L2F}"

# ─── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(realpath "$SCRIPT_DIR/../../contracts/yield_vault")"
WASM_OUT="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/yield_vault.wasm"

# ─── Step 1: Compile the Soroban contract ───────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 1: Compiling yield_vault contract (Rust -> WASM)"
echo "════════════════════════════════════════════════════════════════════"

cd "$CONTRACT_DIR"
stellar contract build

if [ ! -f "$WASM_OUT" ]; then
  echo "ERROR: Compiled WASM not found at $WASM_OUT"
  exit 1
fi
echo "  ✓ WASM compiled successfully: $WASM_OUT"

# ─── Step 2: Deploy the WASM to Testnet ──────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 2: Deploying WASM to Stellar Testnet"
echo "════════════════════════════════════════════════════════════════════"

# Deploy and capture the contract ID from stdout.
# We capture stdout only; stderr is written to a temp log for diagnostics.
DEPLOY_OUTPUT=$(stellar contract deploy \
  --wasm "$WASM_OUT" \
  --source "$DEPLOYER_IDENTITY" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>/tmp/deploy_stderr.log)

# Use portable grep (-oE instead of -oP for macOS/BSD compatibility).
# Stellar Testnet contract IDs are 56 chars and start with 'C'.
CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE 'C[A-Z0-9]{55}' | head -1 || true)

if [ -z "$CONTRACT_ID" ]; then
  echo "ERROR: Failed to extract Contract ID from deploy output."
  echo "Raw output:"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "  ✓ Contract deployed!"
echo "  Contract ID: $CONTRACT_ID"

# ─── Step 3: Initialize the vault ────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 3: Initializing yield_vault contract"
echo "════════════════════════════════════════════════════════════════════"

# Invoke initialize(admin, asset, name, symbol, decimals). Phase 1 yield is
# deterministic simulation only and must not be used as real RWA/T-Bill yield.
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$DEPLOYER_IDENTITY" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS" \
  --asset "$ASSET_CONTRACT_ID" \
  --name "YieldAnchor Vault" \
  --symbol "yVAULT" \
  --decimals 6

echo "  ✓ Contract initialized with admin=$ADMIN_ADDRESS, asset=$ASSET_CONTRACT_ID"

# ─── Step 4: Output the Contract ID for downstream consumers ─────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "  Add this to your indexer .env file:"
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  CONTRACT_ID=$CONTRACT_ID              │"
echo "  └──────────────────────────────────────────────────────┘"
echo ""

# Write to a .env-compatible file for easy sourcing
echo "CONTRACT_ID=$CONTRACT_ID" > "$SCRIPT_DIR/../.contract_id"
echo "Contract ID written to scripts/.contract_id"
