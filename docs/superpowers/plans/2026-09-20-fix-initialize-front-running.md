# Fix Vault Initialize Front-Running Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require admin signature authentication at the very start of `YieldVault::initialize` to protect uninitialized vaults from front-running admin takeovers, and update tests and documentation accordingly.

**Architecture:** Move `admin.require_auth()` to the start of `YieldVault::initialize` in Soroban SDK, before storage checks, preserving `VaultError::AlreadyInit`. Add unit tests asserting failure when unauthorized callers invoke `initialize` without admin signatures. Update crate README and deployment documentation.

**Tech Stack:** Rust, Soroban SDK v21 (`soroban-sdk`), Cargo, PNPM.

**Spec:** Issue #8: "fix: initialize is unauthenticated, so a front-runner can capture admin on a fresh vault"

## Global Constraints

- Soroban SDK v21 (`soroban-sdk = "21.7.7"`)
- `admin.require_auth()` must be called at the start of `initialize`.
- `AlreadyInit` check logic must remain intact.
- All contract tests must pass 100% (`pnpm run contract:test`).
- Zero clippy warnings with `-D warnings` (`pnpm run contract:clippy`).

---

### Task 1: Authenticate `initialize` and Add Front-Running Unit Tests

**Files:**
- Modify: `contracts/yield_vault/src/lib.rs:100-150` (move `admin.require_auth()` to start of `initialize`)
- Test: `contracts/yield_vault/src/lib.rs:970-1015` (add front-running test cases and verify existing test mock auths)

**Interfaces:**
- Consumes: `soroban_sdk::Address::require_auth(&self)`
- Produces: `YieldVault::initialize(env: Env, admin: Address, asset: Address, name: String, symbol: String, decimals: u32) -> Result<(), VaultError>` with `admin.require_auth()` executed at entry.

- [ ] **Step 1: Write the failing unit tests for unauthorized initialization and front-running**

In `contracts/yield_vault/src/lib.rs`, add tests to the `mod test` module:

```rust
    #[test]
    fn initialize_fails_without_admin_auth() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let vault = env.register_contract(None, YieldVault);
        let client = YieldVaultClient::new(&env, &vault);

        assert!(client
            .try_initialize(
                &admin,
                &asset,
                &String::from_str(&env, "YieldAnchor Vault"),
                &String::from_str(&env, "yVAULT"),
                &6,
            )
            .is_err());
    }

    #[test]
    #[should_panic]
    fn initialize_panics_without_admin_auth() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let vault = env.register_contract(None, YieldVault);
        let client = YieldVaultClient::new(&env, &vault);

        client.initialize(
            &admin,
            &asset,
            &String::from_str(&env, "YieldAnchor Vault"),
            &String::from_str(&env, "yVAULT"),
            &6,
        );
    }
```

- [ ] **Step 2: Run test to verify behavior**

Run: `cargo test -p yield_vault --test test initialize_panics_without_admin_auth` (or `cargo test -p yield_vault initialize_`)
Expected: Passes or fails based on whether `admin.require_auth()` is called at line 122 or top.

- [ ] **Step 3: Move `admin.require_auth()` to the top of `initialize`**

In `contracts/yield_vault/src/lib.rs`:

```rust
    pub fn initialize(
        env: Env,
        admin: Address,
        asset: Address,
        name: String,
        symbol: String,
        decimals: u32,
    ) -> Result<(), VaultError> {
        // The administrator must authorize assignment of control to prevent front-running.
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Config) {
            return Err(VaultError::AlreadyInit);
        }
        if name.is_empty() || name.len() > 32 {
            return Err(VaultError::BadName);
        }
        if symbol.is_empty() || symbol.len() > 32 {
            return Err(VaultError::BadSymbol);
        }
        if decimals > MAX_DECIMALS {
            return Err(VaultError::BadDecimal);
        }

        let config = Config {
            admin: admin.clone(),
            asset: asset.clone(),
            name: name.clone(),
            symbol: symbol.clone(),
            decimals,
            simulation: SIMULATED_YIELD,
        };
        let accounting = Accounting {
            principal: 0,
            accrued: 0,
            rem: 0,
            shares: 0,
            last_ts: env.ledger().timestamp(),
            paused: false,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::Accounting, &accounting);
        env.events().publish(
            ("initialize",),
            (admin, asset, name, symbol, decimals, SIMULATED_YIELD),
        );
        Ok(())
    }
```

Remove the old `admin.require_auth()` call that was previously situated after the `MAX_DECIMALS` check.

- [ ] **Step 4: Run unit tests to verify they all pass**

Run: `cargo test -p yield_vault`
Expected: 15 tests pass with 0 failures.

- [ ] **Step 5: Commit changes**

```bash
git add contracts/yield_vault/src/lib.rs
git commit -m "fix(vault): require admin auth at start of initialize to prevent front-running"
```

---

### Task 2: Update Documentation to Reflect Authentication Guarantees

**Files:**
- Modify: `contracts/yield_vault/README.md:9-16`
- Modify: `docs/deployment/testnet.md:107-112`

- [ ] **Step 1: Update `contracts/yield_vault/README.md`**

Update the feature list to explicitly describe authenticated initialization requiring the designated admin's authorization:

```markdown
- One-time authenticated initialization requiring the designated admin's signature, with arbitrary underlying token, name, symbol, and decimals.
```

- [ ] **Step 2: Update `docs/deployment/testnet.md`**

Update the Phase 1 limitations caveat:
Change:
```markdown
Beyond the yield simulation, the vault has no NAV source, no oracle, no reserve proof,
no fees, no per-user withdrawal queue, and no compliance model. `initialize` is
unauthenticated — the first caller to reach a freshly deployed instance becomes the
vault's admin, so a deployment should be initialized in the same breath as its
creation, as this deployment was.
```
To:
```markdown
Beyond the yield simulation, the vault has no NAV source, no oracle, no reserve proof,
no fees, no per-user withdrawal queue, and no compliance model. `initialize` requires
the designated administrator's authorization (`admin.require_auth()`), preventing
unauthorized third parties from front-running and capturing admin control of a freshly
deployed instance.
```

- [ ] **Step 3: Commit documentation updates**

```bash
git add contracts/yield_vault/README.md docs/deployment/testnet.md
git commit -m "docs: document admin authorization requirement for vault initialization"
```

---

### Task 3: Quality Verification (Tests, Clippy, Format)

**Files:**
- Check: All files in repository

- [ ] **Step 1: Run contract unit tests via pnpm**

Run: `pnpm run contract:test`
Expected: All tests pass 100%.

- [ ] **Step 2: Run clippy checks via pnpm**

Run: `pnpm run contract:clippy`
Expected: Clean build, 0 warnings.

- [ ] **Step 3: Run formatting check via pnpm**

Run: `pnpm run contract:fmt:check`
Expected: Formatting clean.
