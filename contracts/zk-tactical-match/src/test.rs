#![cfg(test)]

use crate::{Error, ZkTacticalMatchContract, ZkTacticalMatchContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

// ============================================================================
// Mock GameHub for Unit Testing
// ============================================================================

#[contract]
pub struct MockGameHub;

#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env,
        _game_id: Address,
        _session_id: u32,
        _player1: Address,
        _player2: Address,
        _player1_points: i128,
        _player2_points: i128,
    ) {
    }

    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {
    }
}

// ============================================================================
// Test Helpers
// ============================================================================

fn setup_test() -> (
    Env,
    ZkTacticalMatchContractClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600,
        protocol_version: 25,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_addr = env.register(MockGameHub, ());
    let admin = Address::generate(&env);
    let contract_id = env.register(ZkTacticalMatchContract, (&admin, &hub_addr));
    let client = ZkTacticalMatchContractClient::new(&env, &contract_id);

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, client, player1, player2)
}

fn mock_proof(env: &Env, tactic: u32, session_id: u32) -> Bytes {
    let mut data = Bytes::new(env);
    data.append(&Bytes::from_array(env, &tactic.to_be_bytes()));
    data.append(&Bytes::from_array(env, &session_id.to_be_bytes()));
    data
}

// ============================================================================
// Basic Game Flow Tests
// ============================================================================

#[test]
fn test_complete_game() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 1u32;
    let points = 100_0000000;

    client.start_game(&session_id, &player1, &player2, &points, &points);

    let game = client.get_game(&session_id);
    assert!(game.winner.is_none());
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);

    // Submit tactics with mock proofs
    let proof1 = mock_proof(&_env, 0, session_id); // Defensive
    let proof2 = mock_proof(&_env, 2, session_id); // Aggressive
    
    client.submit_tactic(&session_id, &player1, &0, &proof1);
    client.submit_tactic(&session_id, &player2, &2, &proof2);

    // Resolve match
    let winner = client.resolve_match(&session_id);
    assert!(winner == player1 || winner == player2);

    let final_game = client.get_game(&session_id);
    assert!(final_game.winner.is_some());
    assert!(final_game.player1_score.is_some());
    assert!(final_game.player2_score.is_some());
}

#[test]
fn test_score_matrix_defensive_vs_aggressive() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 2u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 0, session_id); // Defensive
    let proof2 = mock_proof(&_env, 2, session_id); // Aggressive
    
    client.submit_tactic(&session_id, &player1, &0, &proof1);
    client.submit_tactic(&session_id, &player2, &2, &proof2);

    client.resolve_match(&session_id);

    let game = client.get_game(&session_id);
    // Defensive vs Aggressive = 1-1 (draw)
    assert_eq!(game.player1_score.unwrap(), 1);
    assert_eq!(game.player2_score.unwrap(), 1);
}

#[test]
fn test_score_matrix_balanced_vs_defensive() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 3u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 1, session_id); // Balanced
    let proof2 = mock_proof(&_env, 0, session_id); // Defensive
    
    client.submit_tactic(&session_id, &player1, &1, &proof1);
    client.submit_tactic(&session_id, &player2, &0, &proof2);

    client.resolve_match(&session_id);

    let game = client.get_game(&session_id);
    // Balanced vs Defensive = 1-0 (Balanced wins)
    assert_eq!(game.player1_score.unwrap(), 1);
    assert_eq!(game.player2_score.unwrap(), 0);
    assert_eq!(game.winner.unwrap(), player1);
}

#[test]
fn test_score_matrix_allout_vs_allout() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 4u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 3, session_id); // AllOut
    let proof2 = mock_proof(&_env, 3, session_id); // AllOut
    
    client.submit_tactic(&session_id, &player1, &3, &proof1);
    client.submit_tactic(&session_id, &player2, &3, &proof2);

    client.resolve_match(&session_id);

    let game = client.get_game(&session_id);
    // AllOut vs AllOut = 4-4 (maximum chaos draw, player1 wins tie)
    assert_eq!(game.player1_score.unwrap(), 4);
    assert_eq!(game.player2_score.unwrap(), 4);
    assert_eq!(game.winner.unwrap(), player1); // Tie goes to player1
}

// ============================================================================
// Error Handling Tests
// ============================================================================

#[test]
fn test_cannot_submit_twice() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 5u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 0, session_id);
    client.submit_tactic(&session_id, &player1, &0, &proof1);

    // Try to submit again
    let proof2 = mock_proof(&_env, 1, session_id);
    let result = client.try_submit_tactic(&session_id, &player1, &1, &proof2);
    
    match result {
        Err(Ok(err)) => assert_eq!(err, Error::AlreadySubmitted),
        _ => panic!("Expected AlreadySubmitted error"),
    }
}

#[test]
fn test_cannot_resolve_before_both_submit() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 6u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 0, session_id);
    client.submit_tactic(&session_id, &player1, &0, &proof1);

    let result = client.try_resolve_match(&session_id);
    
    match result {
        Err(Ok(err)) => assert_eq!(err, Error::BothPlayersNotSubmitted),
        _ => panic!("Expected BothPlayersNotSubmitted error"),
    }
}

#[test]
fn test_invalid_tactic() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 7u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof = mock_proof(&_env, 4, session_id); // Invalid: must be 0-3
    let result = client.try_submit_tactic(&session_id, &player1, &4, &proof);
    
    match result {
        Err(Ok(err)) => assert_eq!(err, Error::InvalidTactic),
        _ => panic!("Expected InvalidTactic error"),
    }
}

#[test]
fn test_non_player_cannot_submit() {
    let (env, client, player1, player2) = setup_test();
    let non_player = Address::generate(&env);

    let session_id = 8u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof = mock_proof(&env, 0, session_id);
    let result = client.try_submit_tactic(&session_id, &non_player, &0, &proof);
    
    match result {
        Err(Ok(err)) => assert_eq!(err, Error::NotPlayer),
        _ => panic!("Expected NotPlayer error"),
    }
}

#[test]
fn test_resolve_is_idempotent() {
    let (_env, client, player1, player2) = setup_test();

    let session_id = 9u32;
    client.start_game(&session_id, &player1, &player2, &100_0000000, &100_0000000);

    let proof1 = mock_proof(&_env, 1, session_id);
    let proof2 = mock_proof(&_env, 2, session_id);
    
    client.submit_tactic(&session_id, &player1, &1, &proof1);
    client.submit_tactic(&session_id, &player2, &2, &proof2);

    let winner1 = client.resolve_match(&session_id);
    let winner2 = client.resolve_match(&session_id);
    
    assert_eq!(winner1, winner2);
}

// ============================================================================
// Multiple Games Tests
// ============================================================================

#[test]
fn test_multiple_games_independent() {
    let (env, client, player1, player2) = setup_test();
    let player3 = Address::generate(&env);
    let player4 = Address::generate(&env);

    let session1 = 10u32;
    let session2 = 11u32;

    client.start_game(&session1, &player1, &player2, &100_0000000, &100_0000000);
    client.start_game(&session2, &player3, &player4, &50_0000000, &50_0000000);

    let proof1a = mock_proof(&env, 0, session1);
    let proof1b = mock_proof(&env, 1, session1);
    let proof2a = mock_proof(&env, 2, session2);
    let proof2b = mock_proof(&env, 3, session2);

    client.submit_tactic(&session1, &player1, &0, &proof1a);
    client.submit_tactic(&session1, &player2, &1, &proof1b);
    client.submit_tactic(&session2, &player3, &2, &proof2a);
    client.submit_tactic(&session2, &player4, &3, &proof2b);

    let winner1 = client.resolve_match(&session1);
    let winner2 = client.resolve_match(&session2);

    assert!(winner1 == player1 || winner1 == player2);
    assert!(winner2 == player3 || winner2 == player4);
}
