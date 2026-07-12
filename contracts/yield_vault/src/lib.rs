#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, token};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Asset,
    TotalPoolDeposits,
    Balance(Address),
    DepositTimestamp(Address),
}

#[contract]
pub struct YieldVault;

#[contractimpl]
impl YieldVault {
    // Initialize the contract with an admin and the token contract id (asset)
    pub fn initialize(env: Env, admin: Address, asset_id: Address) {
        // only allow once
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized")
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Asset, &asset_id);
        env.storage().instance().set(&DataKey::TotalPoolDeposits, &0i128);

        // emit initialize event: topics ("init", admin)
        env.events().publish(("init",), (admin,));
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        if amount <= 0 {
            panic!("amount must be positive")
        }

        let asset_id: Address = env.storage().instance().get(&DataKey::Asset).unwrap();

        // transfer tokens from user -> contract
        let token = token::Client::new(&env, &asset_id);
        let contract_addr = env.current_contract_address();
        token.transfer(&user, &contract_addr, &amount);

        // update total pool deposits (instance storage)
        let total: i128 = env.storage().instance().get(&DataKey::TotalPoolDeposits).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalPoolDeposits, &(total + amount));

        // store user balance and timestamp in persistent storage
        env.storage().persistent().set(&DataKey::Balance(user.clone()), &amount);
        env.storage().persistent().set(&DataKey::DepositTimestamp(user.clone()), &env.ledger().timestamp());

        env.events().publish(("deposit",), (user, amount));
    }

    pub fn withdraw(env: Env, user: Address) {
        user.require_auth();

        let balance: i128 = env.storage().persistent().get(&DataKey::Balance(user.clone())).unwrap_or(0);
        if balance <= 0 {
            panic!("no balance")
        }

        let deposit_ts: u64 = env.storage().persistent().get(&DataKey::DepositTimestamp(user.clone())).unwrap_or(0);
        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(deposit_ts) as i128;

        // Fixed APY 8% per year, prorated by seconds elapsed
        let annual_rate_bps: i128 = 800; // 8.00% in basis points (10000 = 100%)
        // interest = balance * rate * elapsed_seconds / (10000 * seconds_per_year)
        let seconds_per_year: i128 = 31_536_000;
        let interest = balance * annual_rate_bps * elapsed / (10_000 * seconds_per_year);

        let payout = balance + interest;

        let asset_id: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = token::Client::new(&env, &asset_id);
        let contract_addr = env.current_contract_address();
        token.transfer(&contract_addr, &user, &payout);

        // update totals and clear user storage
        let total: i128 = env.storage().instance().get(&DataKey::TotalPoolDeposits).unwrap_or(0);
        let new_total = total.saturating_sub(balance);
        env.storage().instance().set(&DataKey::TotalPoolDeposits, &new_total);

        env.storage().persistent().remove(&DataKey::Balance(user.clone()));
        env.storage().persistent().remove(&DataKey::DepositTimestamp(user.clone()));

        env.events().publish(("withdraw",), (user, balance, interest));
    }

    // Helper getters
    pub fn get_total_deposits(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalPoolDeposits).unwrap_or(0)
    }
}
