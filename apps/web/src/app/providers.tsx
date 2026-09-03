import React from 'react';
import { FreighterWalletProvider } from '../components/wallet/FreighterWalletContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <FreighterWalletProvider>{children}</FreighterWalletProvider>;
}
