import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import poolRoutes from './routes/pool.js';
import txRoutes from './routes/transactions.js';
import { startPoller } from './poller.js';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/api/pool-stats', poolRoutes);
app.use('/api/transactions', txRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`YieldAnchor backend listening on ${PORT}`);
  startPoller();
});
