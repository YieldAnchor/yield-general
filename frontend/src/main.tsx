import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FreighterWalletProvider } from './FreighterWalletContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FreighterWalletProvider>
      <App />
    </FreighterWalletProvider>
  </React.StrictMode>
);
