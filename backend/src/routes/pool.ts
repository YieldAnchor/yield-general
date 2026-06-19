import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

router.get('/', async (req, res) => {
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
