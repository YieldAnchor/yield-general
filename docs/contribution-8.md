# 📦 BountyHub – Fix “`initialize` is unauthenticated, so a front‑runner can capture admin on a fresh vault”

> **Author:** Senior Solidity / Soroban Engineer (on behalf of **@mau16ro**)  
> **Reward:** $10 USD  
> **Target platform:** **Soroban** (Stellar smart‑contracts) – Rust SDK  
> **Issue:** `initialize` can be called by anyone and lets the caller set an arbitrary `admin`. A front‑runner can therefore front‑run the first transaction, set himself as `admin` and take complete control of the vault.

---

## 1️⃣ Executive Summary & Technical Objectives

| ✅ Objective | 📄 Description |
|-------------|----------------|
| **Prevent unauthenticated initialization** | `initialize` must only be callable by an authorized address (the *contract owner*). |
| **Eliminate mutable admin parameter** | The admin should be derived from the transaction signer, not supplied as an arbitrary argument. |
| **Preserve backward compatibility** (where possible) | Keep the public API stable for existing front‑ends – we expose a thin wrapper that discards the supplied admin and replaces it with the caller’s address. |
| **Add robust unit‑tests** | Verify that: <br>· Authorized caller can initialize. <br>· Any other caller is rejected. <br>· Re‑initialization is impossible. |
| **Provide a clear build & test guide** | Steps to compile, run tests and deploy on a local Soroban testnet. |

The final patch makes the contract **secure by design**, removing the attack surface that allowed a front‑runner to hijack the vault.

---

## 2️⃣ Architecture – Required Changes

### 2.1 High‑level design

```
+---------------------------+       +---------------------------+
|  Contract Storage (Env)   |       |  Transaction (Env)        |
|  - ADMIN_KEY   -> Address |<----->|  - Invoker() (signer)     |
|  - INITIALIZED -> bool    |       |  - Auth signatures        |
+---------------------------+       +---------------------------+

Initialize Flow (new)
---------------------
1️⃣  Require !INITIALIZED (same as before)
2️⃣  Require Auth from the *invoker* (owner) → `env.auth().require_auth(invoker)`
3️⃣  Store ADMIN_KEY = invoker
4️⃣  Mark INITIALIZED = true
```

### 2️⃣ Detailed code modifications

| File | Change |
|------|--------|
| `src/lib.rs` | • Add `const ADMIN_KEY: Symbol = Symbol::short("admin");` <br>• Add `const INITIALIZED_KEY: Symbol = Symbol::short("init");` <br>• Replace the current `initialize` signature with a **secure version** (admin argument kept only for backward compatibility, but ignored). <br>• Call `env.auth().require_auth(invoker.clone())` to enforce authentication. <br>• Store the invoker as the admin. |
| `src/errors.rs` | • Add a custom error `Error::UnauthorizedInitialize` for clearer revert reasons. |
| `src/lib.rs` (other functions) | • All admin‑protected functions now call `require_admin(&env)` which checks `env.auth().require_auth(admin_addr)`. This centralises the auth logic. |
| `src/tests.rs` | • New unit‑tests covering successful init, double‑init rejection, and unauthenticated init attempt. |

### 2.3 Rationale

* **Auth by signer** – The only address that can produce a valid signature for `env.auth().require_auth` is the transaction’s invoker. By tying admin to the invoker we guarantee that only the entity that signed the transaction can become admin.
* **Immutable admin after init** – The admin can be changed later only through an explicit `set_admin` function that also requires admin auth. This prevents accidental admin loss.
* **Backward compatible wrapper** – Existing front‑ends that still pass an `admin` argument will continue to compile; the argument is ignored, so no breaking change for callers.

---

## 3️⃣ Source Code – Production Ready Implementation

Below is the **complete patched contract** (single‑file for clarity). In a real repository you would split errors, storage helpers, etc., but the diff is self‑contained.

```rust
// src/lib.rs
#![no_std]

use soroban_sdk::{
    contractimpl, contracttype, Address, Bytes, Env, Symbol, Vec,
    // Auth utilities
    auth::{self, AuthorizedInvocation},
};

mod errors {
    soroban_sdk::contracterror! {
        // 1..=255 are reserved for user‑defined errors
        #[derive(Debug, Clone, PartialEq, Eq)]
        pub enum Error {
            // General errors
            AlreadyInitialized = 1,
            UnauthorizedInitialize = 2,
            Unauthorized = 3,
            // ... other contract‑specific errors
        }
    }
}

use errors::Error;

/// Storage keys (static symbols)
const ADMIN_KEY: Symbol = Symbol::short("admin");
const INITIALIZED_KEY: Symbol = Symbol::short("init");

/// Helper to read/write the admin address
fn get_admin(e: &Env) -> Option<Address> {
    e.storage().get(&ADMIN_KEY)
}

fn set_admin(e: &Env, admin: &Address) {
    e.storage().set(&ADMIN_KEY, admin);
}

/// Helper to read/write the initialized flag
fn is_initialized(e: &Env) -> bool {
    e.storage().has(&INITIALIZED_KEY)
}

fn set_initialized(e: &Env) {
    e.storage().set(&INITIALIZED_KEY, &true);
}

/// Centralised admin auth check
fn require_admin(e: &Env) {
    let admin = get_admin(e).expect("admin must be set");
    // The SDK will verify that the transaction includes a signature for `admin`
    e.auth().require_auth(admin);
}

/// ---------------------------------------------------------------------------
/// PUBLIC CONTRACT INTERFACE
/// ---------------------------------------------------------------------------
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    // -----------------------------------------------------------------------
    //  INITIALIZE (SECURE)
    // -----------------------------------------------------------------------
    /// Initialise the contract.
    ///
    /// * **Parameters** (kept for backward compatibility):
    ///   - `admin`:   *ignored* – the real admin will be the invoker.
    ///   - `asset`:   address of the token that will be stored.
    ///   - `name`, `symbol`, `decimals`: token metadata (stored for UI only).
    ///
    /// * **Security**:
    ///   - Callable **only once**.
    ///   - Callable **only by the transaction signer** (the future admin).
    ///
    /// Returns `Ok(())` on success or an `Error` on failure.
    pub fn initialize(
        env: Env,
        // NOTE: we keep this argument for ABI compatibility, but we will ignore it.
        _admin: Address,
        asset: Address,
        name: Bytes,
        symbol: Bytes,
        decimals: u32,
    ) -> Result<(), Error> {
        // 1️⃣ Guard – contract must be fresh
        if is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        // 2️⃣ Auth – only the caller (invoker) can initialise
        let invoker = env.invoker(); // address that signed the tx
        env.auth().require_auth(invoker.clone());

        // 3️⃣ Persist state
        set_admin(&env, &invoker);
        set_initialized(&env);

        // Store token metadata (optional – not part of the security fix)
        env.storage().set(&Symbol::short("asset"), &asset);
        env.storage().set(&Symbol::short("name"), &name);
        env.storage().set(&Symbol::short("symb"), &symbol);
        env.storage().set(&Symbol::short("dec"), &decimals);

        Ok(())
    }

    // -----------------------------------------------------------------------
    //  ADMIN‑PROTECTED EXAMPLE FUNCTION
    // -----------------------------------------------------------------------
    /// Example of an admin‑only function (e.g., change admin)
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        require_admin(&env); // <‑‑ centralised check
        set_admin(&env, &new_admin);
        Ok(())
    }

    // -----------------------------------------------------------------------
    //  READ‑ONLY GETTERS (no auth needed)
    // -----------------------------------------------------------------------
    pub fn admin(env: Env) -> Option<Address> {
        get_admin(&env)
    }

    pub fn is_initialized(env: Env) -> bool {
        is_initialized(&env)
    }

    // Additional vault logic (deposit/withdraw) would go here …
}
```

### 3.1 Important notes

| Feature | Explanation |
|---------|-------------|
| **`env.invoker()`** | Returns the address of the transaction’s source account (the one that provided a signature). |
| **`env.auth().require_auth(addr)`** | Guarantees the transaction includes a valid signature for `addr`. If not, the contract aborts with `Error::Unauthorized`. |
| **Backward‑compatibility** | The original `admin` argument is retained (so existing front‑ends won’t break) but is deliberately **ignored** – the contract always uses the invoker as admin. |
| **Error handling** | Custom `Error` enum provides explicit revert codes (`AlreadyInitialized`, `UnauthorizedInitialize`, `Unauthorized`). This aids front‑end developers and auditors. |
| **Storage layout** | Two keys (`admin` and `init`) are stored as `Symbol`s – minimal gas cost and deterministic layout. |

---

## 4️⃣ Unit Tests – Validation Suite

```rust
// src/tests.rs
#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, AuthorizedInvocation},
    Address, Bytes, Env, Symbol,
};

use super::{Error, VaultContract};

#[test]
fn test_successful_initialization() {
    let env = Env::default();
    // Create two distinct accounts
    let owner = Address::generate(&env);
    let other = Address::generate(&env);

    // Simulate a transaction signed by `owner`
    env.set_invoker(&owner);
    env.auth().set(&owner, AuthorizedInvocation::Contract(&Symbol::short("initialize"), &vec![]));

    // Call initialize – note that we pass a *dummy* admin address (ignored)
    let dummy_admin = other.clone();
    let asset = Address::generate(&env);
    let name = Bytes::from_unsafe_slice(b"Vault Token");
    let symbol = Bytes::from_unsafe_slice(b"VAULT");
    let decimals = 6u32;

    let res = VaultContract::initialize(
        env.clone(),
        dummy_admin,
        asset,
        name,
        symbol,
        decimals,
    );
    assert!(res.is_ok());

    // Verify state
    assert_eq!(VaultContract::admin(env.clone()), Some(owner.clone()));
    assert!(VaultContract::is_initialized(env.clone()));
}

#[test]
fn test_double_initialization_fails() {
    let env = Env::default();
    let owner = Address::generate(&env);
    env.set_invoker(&owner);
    env.auth().set(&owner, AuthorizedInvocation::Contract(&Symbol::short("initialize"), &vec![]));

    //