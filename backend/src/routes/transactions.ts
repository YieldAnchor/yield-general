import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

router.get('/:address', async (req, res) => {
  const address = req.params.address;
  const { data } = await supabase
    .from('transaction_logs')
    .select('*')
    .eq('user_address', address)
    .order('timestamp', { ascending: false })
    .limit(500);
  res.json(data);
});

export default router;
