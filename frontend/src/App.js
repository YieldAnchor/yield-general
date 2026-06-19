import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import * as freighter from '@stellar/freighter-api';
import axios from 'axios';
import './index.css';
const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
export default function App() {
    const [connected, setConnected] = useState(false);
    const [publicKey, setPublicKey] = useState(null);
    const [tvl, setTvl] = useState(0);
    const [apy, setApy] = useState(0);
    const [balance, setBalance] = useState(0);
    const [depositAmount, setDepositAmount] = useState('');
    useEffect(() => {
        (async () => {
            const isConnected = await freighter.isConnected();
            setConnected(Boolean(isConnected));
            if (isConnected) {
                const pk = await freighter.getPublicKey();
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
        }
        catch (e) {
            console.error(e);
        }
    }
    async function connect() {
        await freighter.connect();
        const pk = await freighter.getPublicKey();
        setPublicKey(pk);
        setConnected(true);
    }
    async function deposit() {
        if (!publicKey)
            return alert('Connect wallet first');
        if (!depositAmount || Number(depositAmount) <= 0)
            return alert('Enter amount');
        // Build a Soroban invokeHostFunction transaction using Stellar SDK
        // NOTE: This example prepares the transaction and asks Freighter to sign it, but
        // in production you'd use the generated client bindings or proper XDR building.
        alert('Preparing deposit transaction — this demo will not submit on your behalf');
    }
    async function withdraw() {
        if (!publicKey)
            return alert('Connect wallet first');
        alert('Preparing withdraw transaction — this demo will not submit on your behalf');
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-50 p-6", children: _jsxs("div", { className: "max-w-4xl mx-auto bg-white shadow rounded p-6", children: [_jsxs("header", { className: "flex items-center justify-between mb-6", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "YieldAnchor \u2014 Institutional Dashboard" }), _jsx("div", { children: connected ? (_jsxs("div", { className: "text-sm", children: ["Connected: ", publicKey] })) : (_jsx("button", { onClick: connect, className: "px-4 py-2 bg-indigo-600 text-white rounded", children: "Connect Freighter" })) })] }), _jsxs("section", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6", children: [_jsxs("div", { className: "p-4 border rounded", children: [_jsx("div", { className: "text-sm text-gray-500", children: "Total Value Locked (TVL)" }), _jsxs("div", { className: "text-xl font-bold", children: ["$", tvl.toLocaleString()] })] }), _jsxs("div", { className: "p-4 border rounded", children: [_jsx("div", { className: "text-sm text-gray-500", children: "Current Variable APY" }), _jsxs("div", { className: "text-xl font-bold", children: [apy, "%"] })] }), _jsxs("div", { className: "p-4 border rounded", children: [_jsx("div", { className: "text-sm text-gray-500", children: "Your Asset Balance" }), _jsx("div", { className: "text-xl font-bold", children: balance })] })] }), _jsxs("section", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { className: "p-4 border rounded", children: [_jsx("h2", { className: "font-medium mb-2", children: "Deposit" }), _jsx("input", { type: "number", value: depositAmount, onChange: (e) => setDepositAmount(e.target.value), placeholder: "Amount", className: "w-full p-2 border rounded mb-2" }), _jsx("button", { onClick: deposit, className: "w-full p-2 bg-green-600 text-white rounded", children: "Deposit" })] }), _jsxs("div", { className: "p-4 border rounded", children: [_jsx("h2", { className: "font-medium mb-2", children: "Withdraw" }), _jsx("button", { onClick: withdraw, className: "w-full p-2 bg-red-600 text-white rounded", children: "Withdraw" })] })] })] }) }));
}
