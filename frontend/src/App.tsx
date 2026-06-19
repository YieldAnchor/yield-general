import React, { useEffect, useState } from 'react';
import * as freighter from '@stellar/freighter-api';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import axios from 'axios';

import './index.css';

const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:4000';

export default function App() {
  const [view, setView] = useState<'landing' | 'connect' | 'dashboard'>('landing');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [tvl, setTvl] = useState<number>(0);
  const [apy, setApy] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<string>('');

  useEffect(() => {
    fetchPoolStats();
  }, []);

  async function fetchPoolStats() {
    try {
      const res = await fetch('http://localhost:5000/api/pool-stats');
      const data = await res.json();
      const latest = data.latest;
      setTvl(latest?.tvl || 1240500);
      setApy(latest?.dynamic_apy || 8.75);
    } catch (e) {
      console.error(e);
      // Fallback values if backend fails
      setTvl(1240500);
      setApy(8.75);
    }
  }

  async function connectFreighter() {
    try {
      await (freighter as any).connect();
      const pk = await (freighter as any).getPublicKey();
      setPublicKey(pk);
      setView('dashboard');
    } catch (e) {
      console.error(e);
      alert('Failed to connect to Freighter wallet');
    }
  }

  function handleManualSubmit() {
    if (!amount || amount.trim() === '') {
      return alert('Please enter a valid Stellar Public Key');
    }
    if (!amount.startsWith('G')) {
      return alert('Stellar Public Key must start with G');
    }
    setPublicKey(amount.trim());
    setView('dashboard');
  }

  async function handleDeposit() {
    // FIX: Check against actual publicKey state first
    if (!publicKey) {
      return alert('Connect wallet first');
    }
    if (!depositAmount || Number(depositAmount) <= 0) {
      return alert('Enter amount');
    }

    // Build a Soroban invokeHostFunction transaction using Stellar SDK
    // NOTE: This example prepares the transaction and asks Freighter to sign it, but
    // in production you'd use the generated client bindings or proper XDR building.
    alert('Preparing deposit transaction — this demo will not submit on your behalf');
  }

  async function withdraw() {
    if (!publicKey) return alert('Connect wallet first');
    alert('Preparing withdraw transaction — this demo will not submit on your behalf');
  }

  function shortenKey(key: string | null): string {
    if (!key) return '';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      margin: 0,
      boxSizing: 'border-box'
    }}>
      <div style={{ width: '100%', maxWidth: '800px' }}>

        {/* SCREEN 1: LANDING PAGE */}
        {view === 'landing' && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontSize: '48px',
              fontWeight: '800',
              marginBottom: '16px',
              color: '#0f172a',
              lineHeight: '1.2'
            }}>
              Secure Institutional-Grade Yield on Stellar
            </h1>
            <p style={{
              fontSize: '18px',
              color: '#475569',
              marginBottom: '48px',
              maxWidth: '600px',
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: '1.6'
            }}>
              Anchoring your digital capital to high-efficiency tokenized money markets. Earn predictable, real-time yield powered by Soroban smart contracts.
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
                transition: 'transform 0.2s, backgroundColor 0.2s'
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
              Start Saving & Earning
            </button>

            {/* Features Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '24px',
              marginTop: '32px'
            }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
                  8.75%
                </div>
                <div style={{ fontSize: '14px', color: '#475569' }}>Target APY</div>
              </div>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6', marginBottom: '8px' }}>
                  Instant
                </div>
                <div style={{ fontSize: '14px', color: '#475569' }}>Liquidity</div>
              </div>
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6', marginBottom: '8px' }}>
                  Zero
                </div>
                <div style={{ fontSize: '14px', color: '#475569' }}>Lock-up Penalties</div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 2: WALLET CONNECTION PAGE */}
        {view === 'connect' && (
          <div>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '700',
              marginBottom: '8px',
              color: '#0f172a'
            }}>
              Connect Your Wallet
            </h1>
            <p style={{ color: '#475569', marginBottom: '32px', fontSize: '16px' }}>
              Choose your preferred connection method to access the YieldAnchor dashboard
            </p>

            {/* Freighter Connection Option */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#0f172a' }}>
                Connect automatically via Freighter Wallet
              </h3>
              <p style={{ color: '#475569', marginBottom: '16px', fontSize: '14px' }}>
                Use the Freighter browser extension to securely connect your Stellar wallet
              </p>
              <button
                onClick={connectFreighter}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Connect Freighter
              </button>
            </div>

            {/* Manual Entry Option */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#0f172a' }}>
                Manual Entry
              </h3>
              <p style={{ color: '#475569', marginBottom: '16px', fontSize: '14px' }}>
                Enter your Stellar Public Key manually (for testing purposes)
              </p>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="G..."
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
                  boxSizing: 'border-box'
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
                  marginRight: '12px'
                }}
              >
                Submit & Open Dashboard
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
                  cursor: 'pointer'
                }}
              >
                Back to Home
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 3: MAIN DASHBOARD */}
        {view === 'dashboard' && (
          <div>
            {/* Header */}
            <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#0f172a' }}>
              YieldAnchor
            </h1>
            <p style={{ color: '#475569', marginBottom: '32px', fontSize: '14px' }}>
              Institutional RWA Money Market Dashboard
            </p>

            {/* Moving Headlines Ticker */}
            <div style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 0',
              marginBottom: '24px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                display: 'flex',
                animation: 'scroll 30s linear infinite',
                whiteSpace: 'nowrap'
              }}>
                <style>{`
                  @keyframes scroll {
                    0% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                  }
                `}</style>
                <span style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#334155',
                  paddingLeft: '100%'
                }}>
                  • [LIVE] US 3-Month Treasury Token (yUST3M): Yield holds at 5.24% APR • [MARKET MOVE] BlackRock BUIDL fund surpasses $500M in tokenized volume • [FED WATCH] Interest rates held steady; yield demand shifts to on-chain RWA anchors • [COMPLIANCE] Tokenized Euro Sovereign Debt pool initialized for YieldAnchor tier-1 liquidity •
                </span>
              </div>
            </div>

            {/* Wallet Status */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <span style={{ fontSize: '14px', color: '#475569' }}>Wallet Connection:</span>
              <span style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '4px 12px',
                borderRadius: '20px'
              }}>
                {shortenKey(publicKey)}
              </span>
            </div>

            {/* Protocol Metrics Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '32px'
            }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Value Locked</div>
                <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#3b82f6' }}>${tvl.toLocaleString()} USDC</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Current APY</div>
                <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#10b981' }}>{apy}%</div>
              </div>
            </div>

            {/* Available Bond Pools Overview */}
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#0f172a' }}>
                Available Tokenized Assets & Bond Pools
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px'
              }}>
                {/* Card A: US Treasury Bills Wrapper */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
                      US Treasury Bills Wrapper (yUSTB)
                    </h3>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#10b981',
                      background: 'rgba(16, 185, 129, 0.1)',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      AAA
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                    Risk-Free Primitive
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Underlying: Short-Term United States Sovereign Debt
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Current Allocation</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6' }}>$850,000 USDC</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Individual Yield</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>5.25% APY</div>
                    </div>
                  </div>
                </div>

                {/* Card B: EU Sovereign Debt Anchor */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
                      EU Sovereign Debt Anchor (yEUSB)
                    </h3>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#3b82f6',
                      background: 'rgba(59, 130, 246, 0.1)',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      AA+
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>
                    High-Grade Sovereign
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Underlying: Fractionalized European Central Bank Bonds
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Current Allocation</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6' }}>$390,500 EURC</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>Individual Yield</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>4.15% APY</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Actions Panel */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '16px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Your Position</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#475569' }}>Balance: <strong style={{ color: '#0f172a' }}>{balance} yUSDC</strong></p>

              {/* Deposit Box */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '8px' }}>Deposit Stablecoins</label>
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
                      outline: 'none'
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
                      cursor: 'pointer'
                    }}
                  >
                    Deposit
                  </button>
                </div>
              </div>

              {/* Withdraw Box */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '8px' }}>Withdraw Capital & Yield</label>
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
                    cursor: 'pointer'
                  }}
                >
                  Withdraw All Positions
                </button>
              </div>
            </div>

            {/* Back Button */}
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
                cursor: 'pointer'
              }}
            >
              Back to Home
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
