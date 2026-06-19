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

router.get('/', async (req, res) => {
  if (!supabaseConfigured || !supabase) {
    // Return mock data when Supabase is not configured
    const mockLatest = {
      id: 1,
      tvl: 1240500,
      dynamic_apy: 8.75,
      timestamp: new Date().toISOString()
    };

    const mockHistory = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      tvl: 1200000 + Math.random() * 100000,
      dynamic_apy: 8.5 + Math.random() * 0.5,
      timestamp: new Date(Date.now() - i * 3600000).toISOString()
    }));

    return res.json({ latest: mockLatest, history: mockHistory });
  }

  const { data: latest } = await supabase
    .from('pool_snapshots')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: history } = await supabase
    .from('pool_snapshots')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(100);

  res.json({ latest, history });
});

export default router;
