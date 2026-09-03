import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { Providers } from './app/providers';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
);
