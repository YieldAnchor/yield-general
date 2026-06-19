import React, { useEffect, useState } from 'react';
import * as freighter from '@stellar/freighter-api';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import axios from 'axios';

import './index.css';

const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || 'http://localhost:4000';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [tvl, setTvl] = useState<number>(0);
  const [apy, setApy] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<string>('');

  useEffect(() => {
    (async () => {
        const isConnected = await (freighter as any).isConnected();
        setConnected(Boolean(isConnected));
        if (isConnected) {
          const pk = await (freighter as any).getPublicKey();
          setPublicKey(pk);
        }

      fetchPoolStats();
    })();
  }, []);

  async function fetchPoolStats() {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/pool-stats`);
      const latest = res.data.latest;
      setTvl(latest?.tvl || 0);
      setApy(latest?.dynamic_apy || 0);
    } catch (e) {
      console.error(e);
    }
  }

  async function connect() {
    await (freighter as any).connect();
    const pk = await (freighter as any).getPublicKey();
    setPublicKey(pk);
    setConnected(true);
  }

  async function deposit() {
    if (!publicKey) return alert('Connect wallet first');
    if (!depositAmount || Number(depositAmount) <= 0) return alert('Enter amount');

    // Build a Soroban invokeHostFunction transaction using Stellar SDK
    // NOTE: This example prepares the transaction and asks Freighter to sign it, but
    // in production you'd use the generated client bindings or proper XDR building.
    alert('Preparing deposit transaction — this demo will not submit on your behalf');
  }

  async function withdraw() {
    if (!publicKey) return alert('Connect wallet first');
    alert('Preparing withdraw transaction — this demo will not submit on your behalf');
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white shadow rounded p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">YieldAnchor — Institutional Dashboard</h1>
          <div>
            {connected ? (
              <div className="text-sm">Connected: {publicKey}</div>
            ) : (
              <button onClick={connect} className="px-4 py-2 bg-indigo-600 text-white rounded">Connect Freighter</button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Total Value Locked (TVL)</div>
            <div className="text-xl font-bold">${tvl.toLocaleString()}</div>
          </div>
          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Current Variable APY</div>
            <div className="text-xl font-bold">{apy}%</div>
          </div>
          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Your Asset Balance</div>
            <div className="text-xl font-bold">{balance}</div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded">
            <h2 className="font-medium mb-2">Deposit</h2>
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Amount" className="w-full p-2 border rounded mb-2" />
            <button onClick={deposit} className="w-full p-2 bg-green-600 text-white rounded">Deposit</button>
          </div>

          <div className="p-4 border rounded">
            <h2 className="font-medium mb-2">Withdraw</h2>
            <button onClick={withdraw} className="w-full p-2 bg-red-600 text-white rounded">Withdraw</button>
          </div>
        </section>

      </div>
    </div>
  );
}
