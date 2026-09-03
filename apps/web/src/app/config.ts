export const BACKEND_URL =
  (import.meta as { env?: { VITE_BACKEND_URL?: string } }).env
    ?.VITE_BACKEND_URL || 'http://localhost:4000';

export const STELLAR_NETWORK = 'testnet' as const;
