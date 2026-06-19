import { Server } from '@stellar/stellar-sdk/rpc';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const RPC_URL = process.env.SOROBAN_RPC || 'https://soroban-testnet.stellar.org:443';
const CONTRACT_ID = process.env.CONTRACT_ID || '';

// Check if Supabase is configured
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseConfigured = supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here' && supabaseKey !== 'your_supabase_key_here';

const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

const server = new Server(RPC_URL);

export async function startPoller() {
  console.log('Starting event poller for contract events...');
  if (!supabaseConfigured) {
    console.log('Supabase not configured, poller running in mock mode');
  }
  // Simple polling loop to fetch events every 15s
  setInterval(async () => {
    try {
      const res = await server.getEvents({ cursor: 'now', filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }], limit: 50 });
      const events = res.events || [];
      for (const evt of events) {
        const humanTopics = evt.topic.map((t: any) => t);
        const data = evt.value;
        const type = humanTopics[0] || 'unknown';
        const userAddr = humanTopics[1] ? String(humanTopics[1]) : 'unknown';
        const amount = Number(String(data)) || 0;
        const ts = evt.ledgerClosedAt || new Date().toISOString();
        if (supabaseConfigured && supabase) {
          if (String(type) === 'deposit') {
            await supabase.from('transaction_logs').insert([{ user_address: userAddr, action_type: 'deposit', amount, timestamp: ts }]);
          } else if (String(type) === 'withdraw') {
            await supabase.from('transaction_logs').insert([{ user_address: userAddr, action_type: 'withdraw', amount, timestamp: ts }]);
          }
        }
      }

      // snapshot TVL (mock dynamic APY generation)
      const tvl = Math.floor(Math.random() * 10_000_000) / 100;
      const dynamic_apy = (5 + Math.random() * 5).toFixed(2);
      if (supabaseConfigured && supabase) {
        await supabase.from('pool_snapshots').insert([{ tvl, dynamic_apy: Number(dynamic_apy), timestamp: new Date().toISOString() }]);
      }
    } catch (e) {
      console.error('Poller error', e);
    }
  }, 15_000);
}
