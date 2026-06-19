-- Migration: create pool_snapshots and transaction_logs tables

create table if not exists pool_snapshots (
  id uuid primary key default gen_random_uuid(),
  tvl numeric(36,6) not null,
  dynamic_apy numeric(8,4) not null,
  timestamp timestamptz not null default now()
);

create table if not exists transaction_logs (
  id uuid primary key default gen_random_uuid(),
  user_address text not null,
  action_type text not null,
  amount numeric(36,6) not null,
  timestamp timestamptz not null default now()
);
