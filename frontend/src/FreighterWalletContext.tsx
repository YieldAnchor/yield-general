import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';

// ---------------------------------------------------------------------------
// Freighter API v6.0.1 named imports
// Docs: https://www.npmjs.com/package/@stellar/freighter-api
//
// Key facts for this version:
//  - isConnected() returns { isConnected: boolean; error?: FreighterApiError }
//  - getAddress()  returns { address: string;     error?: FreighterApiError }
//  - requestAccess() returns { address: string;   error?: FreighterApiError }
//  - WatchWalletChanges is a class: new WatchWalletChanges().watch(callback)
// ---------------------------------------------------------------------------
import {
  getAddress,
  isConnected,
  requestAccess,
  WatchWalletChanges,
} from '@stellar/freighter-api';

// ---------------------------------------------------------------------------
// Shape of the context value consumed by the app
// ---------------------------------------------------------------------------
export interface FreighterWalletState {
  /** The connected user's Stellar public key (G…), or null if not connected */
  publicKey: string | null;
  /** True if Freighter extension is installed in the browser */
  isInstalled: boolean;
  /** True while we are performing the async handshake on mount */
  isConnecting: boolean;
  /** Any error message from the connection attempt */
  error: string | null;
  /** Manually trigger a (re)connection */
  connect: () => Promise<void>;
  /** Disconnect the wallet (clears local state) */
  disconnect: () => void;
}

const FreighterWalletContext = createContext<FreighterWalletState | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Provider component – wraps the app tree
// ---------------------------------------------------------------------------
export function FreighterWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Ref to hold the WatchWalletChanges instance so we can stop() it
  const walletWatcherRef = useRef<WatchWalletChanges | null>(null);

  // ── Initial detection: is Freighter installed? ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const result = await isConnected();
        if (!cancelled) {
          // isConnected() returns { isConnected: boolean }
          setIsInstalled(result.isConnected);
          if (!result.isConnected) {
            setIsConnecting(false);
          }
        }
      } catch {
        if (!cancelled) {
          setIsInstalled(false);
          setIsConnecting(false);
        }
      }
    }

    detect();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auto-connect on mount (if installed) ───────────────────────────
  // This addresses the common failure point where Freighter doesn't
  // respond on component mount: we retry with a short delay.
  useEffect(() => {
    if (!isInstalled) return;

    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 800;

    async function handshake() {
      while (retryCount < MAX_RETRIES && !cancelled) {
        try {
          // requestAccess() prompts the user to authorize the dapp.
          // It returns { address: string } which we can use directly.
          // In some Freighter versions, it may not exist – we handle that
          // in the catch block below.
          const accessResult = await requestAccess();
          const pk = accessResult.address;

          if (!cancelled) {
            setPublicKey(pk);
            setError(null);
            setIsConnecting(false);
          }
          return; // success – exit retry loop
        } catch (err: any) {
          retryCount++;

          // If requestAccess failed because the function doesn't exist,
          // try falling back to getAddress() directly.
          if (retryCount >= MAX_RETRIES) {
            // Try getAddress as a fallback if requestAccess failed
            let lastError = err?.message;
            try {
              const addrResult = await getAddress();
              if (!cancelled && addrResult.address) {
                setPublicKey(addrResult.address);
                setError(null);
                setIsConnecting(false);
                return;
              }
            } catch (fallbackErr: any) {
              lastError = fallbackErr?.message || lastError;
            }
            if (!cancelled) {
              setError(
                lastError ||
                  'Freighter failed to respond. Please unlock the extension and try again.',
              );
              setIsConnecting(false);
            }
            return;
          }
          // Wait before retrying (extension may still be initializing)
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    handshake();

    return () => {
      cancelled = true;
    };
  }, [isInstalled]);

  // ── Watch for wallet changes (account switch, disconnect) ──────────
  // The watcher polls Freighter every 2s for state changes and fires
  // the callback if the address or network changed.
  useEffect(() => {
    if (!isInstalled) return;

    const watcher = new WatchWalletChanges(2000);
    walletWatcherRef.current = watcher;

    watcher.watch((params) => {
      // params: { address, network, networkPassphrase, error? }
      if (params.error) {
        setPublicKey(null);
        setError(params.error.message || 'Wallet error');
      } else {
        setPublicKey(params.address || null);
        setError(null);
      }
    });

    return () => {
      // Stop whichever watcher is currently active – the `connect()`
      // callback may have replaced it after a manual disconnect/reconnect.
      walletWatcherRef.current?.stop();
      walletWatcherRef.current = null;
    };
  }, [isInstalled]);

  // ── Manual connect (e.g. user clicks "Connect Freighter") ──────────
  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Re-check installation
      const connResult = await isConnected();
      if (!connResult.isConnected) {
        setError(
          'Freighter extension is not installed. Please install it from freighter.app.',
        );
        setIsInstalled(false);
        setIsConnecting(false);
        return;
      }
      setIsInstalled(true);

      // Try requestAccess first (prompts user), fall back to getAddress
      let pk: string | null = null;
      try {
        const accessResult = await requestAccess();
        pk = accessResult.address;
      } catch {
        const addrResult = await getAddress();
        pk = addrResult.address;
      }

      if (pk) {
        setPublicKey(pk);
        setError(null);

        // Re-initialize wallet watcher if needed
        if (!walletWatcherRef.current) {
          const watcher = new WatchWalletChanges(2000);
          walletWatcherRef.current = watcher;
          watcher.watch((params) => {
            if (params.error) {
              setPublicKey(null);
              setError(params.error.message || 'Wallet error');
            } else {
              setPublicKey(params.address || null);
              setError(null);
            }
          });
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failed. Is Freighter unlocked?');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // ── Disconnect (stop watcher + clear local state) ──────────────────
  const disconnect = useCallback(() => {
    walletWatcherRef.current?.stop();
    walletWatcherRef.current = null;
    setPublicKey(null);
    setError(null);
  }, []);

  const value: FreighterWalletState = {
    publicKey,
    isInstalled,
    isConnecting,
    error,
    connect,
    disconnect,
  };

  return (
    <FreighterWalletContext.Provider value={value}>
      {children}
    </FreighterWalletContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook for consuming the context
// ---------------------------------------------------------------------------
export function useFreighterWallet(): FreighterWalletState {
  const ctx = useContext(FreighterWalletContext);
  if (!ctx) {
    throw new Error(
      'useFreighterWallet must be used within a <FreighterWalletProvider>',
    );
  }
  return ctx;
}
