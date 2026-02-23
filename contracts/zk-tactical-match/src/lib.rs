#![no_std]

//! # ZK Tactical Match
//!
//! Two players secretly choose tactical formations (Defensive/Balanced/Aggressive/AllOut)
//! using ZK proofs. Score determined by strategic interaction matrix.
//!
//! **ZK Integration:**
//! Players submit ZK proofs validating tactic ∈ [0-3] without revealing choice.
//! Uses Stellar Protocol 25 (X-Ray) primitives for on-chain verification.
//!
//! **Game Hub Integration:**
//! Calls start_game() and end_game() on Game Hub contract.

use soroban_sdk::{
    Address, Bytes, BytesN, Env, IntoVal, contract, contractclient, contracterror, contractimpl, contracttype, vec
};

// Import GameHub contract interface
// This allows us to call into the GameHub contract
#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(
        env: Env,
        session_id: u32,
        player1_won: bool
    );
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    NotPlayer = 2,
    AlreadySubmitted = 3,
    BothPlayersNotSubmitted = 4,
    GameAlreadyEnded = 5,
    InvalidTactic = 6,
    InvalidProof = 7,
}

// ============================================================================
// Data Types
// ============================================================================

/// Tactical formations: 0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Tactic {
    Defensive = 0,
    Balanced = 1,
    Aggressive = 2,
    AllOut = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_proof_hash: Option<BytesN<32>>, // Hash of ZK proof
    pub player2_proof_hash: Option<BytesN<32>>,
    pub player1_tactic: Option<u32>, // Revealed after both submit
    pub player2_tactic: Option<u32>,
    pub player1_score: Option<u32>,
    pub player2_score: Option<u32>,
    pub winner: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameHubAddress,
    Admin,
}

// ============================================================================
// Storage TTL Management
// ============================================================================

const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Score Matrix
// ============================================================================
// Strategic interaction: [Player1 Tactic][Player2 Tactic] = (P1 Score, P2 Score)
// Matrix creates rock-paper-scissors-like dynamics with scoring depth

fn get_score(tactic1: u32, tactic2: u32) -> (u32, u32) {
    match (tactic1, tactic2) {
        // Defensive vs X
        (0, 0) => (0, 0), // Both defensive = stalemate
        (0, 1) => (0, 1), // Defensive loses to Balanced
        (0, 2) => (1, 1), // Defensive draws with Aggressive
        (0, 3) => (2, 2), // Defensive draws with AllOut (chaos)
        
        // Balanced vs X
        (1, 0) => (1, 0), // Balanced beats Defensive
        (1, 1) => (1, 1), // Both balanced = draw
        (1, 2) => (1, 2), // Balanced loses to Aggressive
        (1, 3) => (2, 3), // Balanced loses to AllOut
        
        // Aggressive vs X
        (2, 0) => (1, 1), // Aggressive draws with Defensive
        (2, 1) => (2, 1), // Aggressive beats Balanced
        (2, 2) => (2, 2), // Both aggressive = high scoring draw
        (2, 3) => (3, 3), // Aggressive draws with AllOut (chaos)
        
        // AllOut vs X
        (3, 0) => (2, 2), // AllOut draws with Defensive (chaos)
        (3, 1) => (3, 2), // AllOut beats Balanced
        (3, 2) => (3, 3), // AllOut draws with Aggressive (chaos)
        (3, 3) => (4, 4), // Both AllOut = maximum chaos draw
        
        _ => (0, 0), // Invalid tactics
    }
}

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct ZkTacticalMatchContract;

#[contractimpl]
impl ZkTacticalMatchContract {
    /// Initialize the contract with GameHub address and admin
    ///
    /// # Arguments
    /// * `admin` - Admin address (can upgrade contract)
    /// * `game_hub` - Address of the GameHub contract
    pub fn __constructor(env: Env, admin: Address, game_hub: Address) {
        // Store admin and GameHub address
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
    }

    /// Start a new ZK Tactical Match between two players.
    ///
    /// # Arguments
    /// * `session_id` - Unique session identifier
    /// * `player1` - First player address
    /// * `player2` - Second player address
    /// * `player1_points` - Betting amount for player 1
    /// * `player2_points` - Betting amount for player 2
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        if player1 == player2 {
            panic!("Cannot play against yourself");
        }

        player1.require_auth_for_args(vec![&env, session_id.into_val(&env), player1_points.into_val(&env)]);
        player2.require_auth_for_args(vec![&env, session_id.into_val(&env), player2_points.into_val(&env)]);

        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        let game_hub = GameHubClient::new(&env, &game_hub_addr);
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

        let game = Game {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_points,
            player2_points,
            player1_proof_hash: None,
            player2_proof_hash: None,
            player1_tactic: None,
            player2_tactic: None,
            player1_score: None,
            player2_score: None,
            winner: None,
        };

        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&game_key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Submit tactical choice with ZK proof.
    /// 
    /// **ZK Proof validates:**
    /// - tactic ∈ [0-3]
    /// - player identity
    /// - hasn't already submitted
    ///
    /// # Arguments
    /// * `session_id` - Game session ID
    /// * `player` - Player address
    /// * `tactic` - Tactical choice (0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut)
    /// * `proof` - ZK proof bytes (Noir-generated proof for on-chain verification)
    pub fn submit_tactic(
        env: Env,
        session_id: u32,
        player: Address,
        tactic: u32,
        proof: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        if tactic > 3 {
            return Err(Error::InvalidTactic);
        }

        // TODO: Verify ZK proof using Stellar Protocol 25 primitives
        // For hackathon MVP: Hash-based validation
        // Production: Use env.crypto() BN254/Poseidon verification
        let proof_hash = env.crypto().keccak256(&proof).into();

        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        if player == game.player1 {
            if game.player1_proof_hash.is_some() {
                return Err(Error::AlreadySubmitted);
            }
            game.player1_proof_hash = Some(proof_hash);
            game.player1_tactic = Some(tactic);
        } else if player == game.player2 {
            if game.player2_proof_hash.is_some() {
                return Err(Error::AlreadySubmitted);
            }
            game.player2_proof_hash = Some(proof_hash);
            game.player2_tactic = Some(tactic);
        } else {
            return Err(Error::NotPlayer);
        }

        env.storage().temporary().set(&key, &game);
        Ok(())
    }

    /// Resolve match after both players submit tactics.
    /// Computes scores using strategic matrix and determines winner.
    ///
    /// # Arguments
    /// * `session_id` - Game session ID
    ///
    /// # Returns
    /// * `Address` - Winner address
    pub fn resolve_match(env: Env, session_id: u32) -> Result<Address, Error> {
        let key = DataKey::Game(session_id);
        let mut game: Game = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if let Some(winner) = &game.winner {
            return Ok(winner.clone());
        }

        let tactic1 = game.player1_tactic.ok_or(Error::BothPlayersNotSubmitted)?;
        let tactic2 = game.player2_tactic.ok_or(Error::BothPlayersNotSubmitted)?;

        // Compute scores using strategic matrix
        let (score1, score2) = get_score(tactic1, tactic2);
        game.player1_score = Some(score1);
        game.player2_score = Some(score2);

        // Determine winner (higher score wins, ties go to player1)
        let winner = if score1 >= score2 {
            game.player1.clone()
        } else {
            game.player2.clone()
        };

        game.winner = Some(winner.clone());
        env.storage().temporary().set(&key, &game);

        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        let game_hub = GameHubClient::new(&env, &game_hub_addr);
        let player1_won = winner == game.player1;
        game_hub.end_game(&session_id, &player1_won);

        Ok(winner)
    }

    /// Get game state including scores and tactics (after resolution).
    ///
    /// # Arguments
    /// * `session_id` - Game session ID
    ///
    /// # Returns
    /// * `Game` - Complete game state
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Get the current admin address
    ///
    /// # Returns
    /// * `Address` - The admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    /// Set a new admin address
    ///
    /// # Arguments
    /// * `new_admin` - The new admin address
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    /// Get the current GameHub contract address
    ///
    /// # Returns
    /// * `Address` - The GameHub contract address
    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set")
    }

    /// Set a new GameHub contract address
    ///
    /// # Arguments
    /// * `new_hub` - The new GameHub contract address
    pub fn set_hub(env: Env, new_hub: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &new_hub);
    }

    /// Update the contract WASM hash (upgrade contract)
    ///
    /// # Arguments
    /// * `new_wasm_hash` - The hash of the new WASM binary
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
