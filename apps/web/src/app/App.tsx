import React, { useEffect, useState, useCallback } from 'react';

import '../index.css';
import { useFreighterWallet } from '../components/wallet/FreighterWalletContext';
import { BACKEND_URL } from './config';

/** Poll interval for refreshing pool stats from the backend (ms) */
const POLL_INTERVAL_MS = 15_000;

export default function App() {
  const [view, setView] = useState<'landing' | 'connect' | 'dashboard'>(
    'landing',
  );
  const [manualKey, setManualKey] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [tvl, setTvl] = useState<number>(0);
  const [apy, setApy] = useState<number>(0);
  const [balance] = useState<number>(0);

  // ── Freighter wallet state from our context provider ──────────────
  const {
    publicKey,
    isInstalled,
    isConnecting,
    error: walletError,
    connect,
    disconnect,
  } = useFreighterWallet();

  // ── Real-time pool stats fetch (polls backend every 15s) ───────────
  // Runs on mount + whenever the wallet publicKey changes, so the
  // dashboard always reflects fresh data.
  const fetchPoolStats = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/pool-stats`);
      const data = await res.json();
      const latest = data.latest;
      if (latest) {
        setTvl(latest.tvl ?? 0);
        setApy(latest.dynamic_apy ?? 0);
      }
    } catch (e) {
      console.error('Failed to fetch pool stats:', e);
    }
  }, []);

  useEffect(() => {
    // Fetch immediately then set up polling interval
    fetchPoolStats();
    const interval = setInterval(fetchPoolStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPoolStats, publicKey]); // re-syncs when wallet state changes

  // ── Navigate on wallet connect / disconnect ────────────────────────
  useEffect(() => {
    if (publicKey && view === 'connect') {
      setView('dashboard');
    } else if (!publicKey && view === 'dashboard' && !manualKey.trim()) {
      // Freighter disconnected and no manual key entered — go back to connect
      setView('connect');
    }
  }, [publicKey, view, manualKey]);

  // ── Manual public key submission ──────────────────────────────────
  function handleManualSubmit() {
    const trimmed = manualKey.trim();
    if (!trimmed) {
      return alert('Please enter a valid Stellar Public Key');
    }
    if (!trimmed.startsWith('G')) {
      return alert('Stellar Public Key must start with G');
    }
    setView('dashboard');
  }

  // ── Deposit & Withdraw (stubs – real TX building omitted) ─────────
  async function handleDeposit() {
    const effectiveKey = publicKey || manualKey.trim();
    if (!effectiveKey) {
      return alert('Connect wallet first');
    }
    if (!depositAmount || Number(depositAmount) <= 0) {
      return alert('Enter amount');
    }
    alert(
      'Preparing deposit transaction — this demo will not submit on your behalf',
    );
  }

  async function withdraw() {
    const effectiveKey = publicKey || manualKey.trim();
    if (!effectiveKey) return alert('Connect wallet first');
    alert(
      'Preparing withdraw transaction — this demo will not submit on your behalf',
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function shortenKey(key: string): string {
    if (!key) return '';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }

  const displayKey = publicKey || manualKey.trim();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '40px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: 0,
        boxSizing: 'border-box' as const,
      }}
    >
      <div style={{ width: '100%', maxWidth: '800px' }}>
        {/* ═══════════════════ SCREEN 1: LANDING PAGE ═══════════════════ */}
        {view === 'landing' && (
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '48px',
                fontWeight: '800',
                marginBottom: '16px',
                color: '#0f172a',
                lineHeight: '1.2',
              }}
            >
              Secure Institutional-Grade Yield on Stellar
            </h1>
            <p
              style={{
                fontSize: '18px',
                color: '#475569',
                marginBottom: '48px',
                maxWidth: '600px',
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: '1.6',
              }}
            >
              Anchoring your digital capital to high-efficiency tokenized money
              markets. Earn predictable, real-time yield powered by Soroban
              smart contracts.
            </p>

            <button
              onClick={() => setView('connect')}
              style={{
                padding: '16px 48px',
                fontSize: '18px',
                fontWeight: '700',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                marginBottom: '48px',
                transition: 'transform 0.2s, backgroundColor 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }}
            >
              Start Saving &amp; Earning
            </button>

            {/* Features Section */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                marginTop: '32px',
              }}
            >
              {[
                { value: '8.75%', label: 'Target APY', color: '#10b981' },
                { value: 'Instant', label: 'Liquidity', color: '#3b82f6' },
                { value: 'Zero', label: 'Lock-up Penalties', color: '#8b5cf6' },
              ].map((feat) => (
                <div
                  key={feat.label}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '24px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '32px',
                      fontWeight: '700',
                      color: feat.color,
                      marginBottom: '8px',
                    }}
                  >
                    {feat.value}
                  </div>
                  <div style={{ fontSize: '14px', color: '#475569' }}>
                    {feat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════ SCREEN 2: WALLET CONNECTION ═══════════════════ */}
        {view === 'connect' && (
          <div>
            <h1
              style={{
                fontSize: '32px',
                fontWeight: '700',
                marginBottom: '8px',
                color: '#0f172a',
              }}
            >
              Connect Your Wallet
            </h1>
            <p
              style={{
                color: '#475569',
                marginBottom: '32px',
                fontSize: '16px',
              }}
            >
              Choose your preferred connection method to access the YieldAnchor
              dashboard
            </p>

            {/* Freighter Connection Option */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  color: '#0f172a',
                }}
              >
                Connect automatically via Freighter Wallet
              </h3>
              <p
                style={{
                  color: '#475569',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}
              >
                Use the Freighter browser extension to securely connect your
                Stellar wallet
              </p>

              {/* Status indicators */}
              {!isInstalled && !isConnecting && (
                <p
                  style={{
                    color: '#ef4444',
                    fontSize: '13px',
                    marginBottom: '12px',
                  }}
                >
                  ⚠ Freighter extension not detected. Install it from{' '}
                  <a
                    href="https://freighter.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b82f6' }}
                  >
                    freighter.app
                  </a>
                </p>
              )}

              {isConnecting && (
                <p
                  style={{
                    color: '#f59e0b',
                    fontSize: '13px',
                    marginBottom: '12px',
                  }}
                >
                  ⏳ Connecting to Freighter… please unlock the extension if
                  prompted.
                </p>
              )}

              {walletError && (
                <p
                  style={{
                    color: '#ef4444',
                    fontSize: '13px',
                    marginBottom: '12px',
                  }}
                >
                  {walletError}
                </p>
              )}

              {publicKey && (
                <p
                  style={{
                    color: '#10b981',
                    fontSize: '13px',
                    marginBottom: '12px',
                  }}
                >
                  ✓ Connected as {shortenKey(publicKey)}
                </p>
              )}

              <button
                onClick={connect}
                disabled={isConnecting}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: isConnecting ? '#94a3b8' : '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                }}
              >
                {isConnecting ? 'Connecting…' : 'Connect Freighter'}
              </button>
            </div>

            {/* Manual Entry Option */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  color: '#0f172a',
                }}
              >
                Manual Entry
              </h3>
              <p
                style={{
                  color: '#475569',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}
              >
                Enter your Stellar Public Key manually (for testing purposes)
              </p>
              <input
                type="text"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="G…"
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: '#0f172a',
                  fontSize: '16px',
                  marginBottom: '16px',
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
              <button
                onClick={handleManualSubmit}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginRight: '12px',
                }}
              >
                Submit &amp; Open Dashboard
              </button>
              <button
                onClick={() => setView('landing')}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: 'transparent',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════ SCREEN 3: MAIN DASHBOARD ═══════════════════ */}
        {view === 'dashboard' && (
          <div>
            {/* Header */}
            <h1
              style={{
                fontSize: '28px',
                fontWeight: '700',
                marginBottom: '8px',
                color: '#0f172a',
              }}
            >
              YieldAnchor
            </h1>
            <p
              style={{
                color: '#475569',
                marginBottom: '32px',
                fontSize: '14px',
              }}
            >
              Institutional RWA Money Market Dashboard
            </p>

            {/* Moving Headlines Ticker */}
            <div
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 0',
                marginBottom: '24px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  animation: 'scroll 30s linear infinite',
                  whiteSpace: 'nowrap',
                }}
              >
                <style>{`
                  @keyframes scroll {
                    0% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                  }
                `}</style>
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: '#334155',
                    paddingLeft: '100%',
                  }}
                >
                  • [LIVE] US 3-Month Treasury Token (yUST3M): Yield holds at
                  5.24% APR • [MARKET MOVE] BlackRock BUIDL fund surpasses
                  $500M in tokenized volume • [FED WATCH] Interest rates held
                  steady; yield demand shifts to on-chain RWA anchors •
                  [COMPLIANCE] Tokenized Euro Sovereign Debt pool initialized
                  for YieldAnchor tier-1 liquidity •
                </span>
              </div>
            </div>

            {/* Wallet Status */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            >
              <span style={{ fontSize: '14px', color: '#475569' }}>
                Wallet Connection:
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '4px 12px',
                  borderRadius: '20px',
                }}
              >
                {shortenKey(displayKey)}
              </span>
            </div>

            {/* Protocol Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '32px',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '20px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Total Value Locked
                </div>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    marginTop: '8px',
                    color: '#3b82f6',
                  }}
                >
                  ${tvl.toLocaleString()} USDC
                </div>
              </div>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '20px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    color: '#475569',
                    textTransform: 'uppercase',
                  }}
                >
                  Current APY
                </div>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    marginTop: '8px',
                    color: '#10b981',
                  }}
                >
                  {apy}%
                </div>
              </div>
            </div>

            {/* Available Bond Pools Overview */}
            <div style={{ marginBottom: '32px' }}>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '16px',
                  color: '#0f172a',
                }}
              >
                Available Tokenized Assets &amp; Bond Pools
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* Card A: US Treasury Bills Wrapper */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#0f172a',
                        marginBottom: '4px',
                      }}
                    >
                      US Treasury Bills Wrapper (yUSTB)
                    </h3>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      AAA
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#475569',
                      marginBottom: '8px',
                    }}
                  >
                    Risk-Free Primitive
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      marginBottom: '12px',
                    }}
                  >
                    Underlying: Short-Term United States Sovereign Debt
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        Current Allocation
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#3b82f6',
                        }}
                      >
                        $850,000 USDC
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        Individual Yield
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#10b981',
                        }}
                      >
                        5.25% APY
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card B: EU Sovereign Debt Anchor */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#0f172a',
                        marginBottom: '4px',
                      }}
                    >
                      EU Sovereign Debt Anchor (yEUSB)
                    </h3>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: '#3b82f6',
                        background: 'rgba(59, 130, 246, 0.1)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      AA+
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#475569',
                      marginBottom: '8px',
                    }}
                  >
                    High-Grade Sovereign
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#64748b',
                      marginBottom: '12px',
                    }}
                  >
                    Underlying: Fractionalized European Central Bank Bonds
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        Current Allocation
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#3b82f6',
                        }}
                      >
                        $390,500 EURC
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        Individual Yield
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#10b981',
                        }}
                      >
                        4.15% APY
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Actions Panel */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                padding: '24px',
                borderRadius: '16px',
                marginBottom: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h3
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#0f172a',
                }}
              >
                Your Position
              </h3>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '14px',
                  color: '#475569',
                }}
              >
                Balance:{' '}
                <strong style={{ color: '#0f172a' }}>{balance} yUSDC</strong>
              </p>

              {/* Deposit Box */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: '#475569',
                    marginBottom: '8px',
                  }}
                >
                  Deposit Stablecoins
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#0f172a',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleDeposit}
                    style={{
                      background: '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0 24px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Deposit
                  </button>
                </div>
              </div>

              {/* Withdraw Box */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    color: '#475569',
                    marginBottom: '8px',
                  }}
                >
                  Withdraw Capital &amp; Yield
                </label>
                <button
                  onClick={withdraw}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    borderRadius: '8px',
                    padding: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Withdraw All Positions
                </button>
              </div>
            </div>

            {/* Disconnect / Back */}
            <div style={{ display: 'flex', gap: '12px' }}>
              {publicKey && (
                <button
                  onClick={disconnect}
                  style={{
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: '600',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Disconnect Wallet
                </button>
              )}
              <button
                onClick={() => setView('landing')}
                style={{
                  padding: '12px 24px',
                  fontSize: '14px',
                  fontWeight: '600',
                  backgroundColor: 'transparent',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
