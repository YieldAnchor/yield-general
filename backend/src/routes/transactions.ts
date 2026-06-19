import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Check if Supabase is configured
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseConfigured = supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here' && supabaseKey !== 'your_supabase_key_here';

const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

router.get('/:address', async (req, res) => {
  const address = req.params.address;

  if (!supabaseConfigured || !supabase) {
    // Return mock data when Supabase is not configured
    const mockData = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      user_address: address,
      amount: 100 + Math.random() * 1000,
      type: i % 2 === 0 ? 'deposit' : 'withdraw',
      timestamp: new Date(Date.now() - i * 86400000).toISOString()
    }));
    return res.json(mockData);
  }

  const { data } = await supabase
    .from('transaction_logs')
    .select('*')
    .eq('user_address', address)
    .order('timestamp', { ascending: false })
    .limit(500);
  res.json(data);
});

export default router;
