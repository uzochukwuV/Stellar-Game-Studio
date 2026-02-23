// ZK Tactical Match - Noir Circuit
// Proves a player selected a valid tactic without revealing which one

use std::hash::pedersen_hash;

fn main(
    // Private inputs (hidden from verifier)
    tactic: u32,
    player_secret: Field,
    
    // Public inputs (visible to verifier)
    session_id: pub u32
) -> pub Field {
    // Constraint 1: Tactic must be in valid range [0-3]
    // 0 = Defensive, 1 = Balanced, 2 = Aggressive, 3 = AllOut
    assert(tactic <= 3, "Tactic must be between 0 and 3");
    
    // Compute and return commitment
    // This proves the player committed to this specific tactic
    let commitment = pedersen_hash([
        tactic as Field,
        player_secret,
        session_id as Field
    ]);
    
    commitment
}

#[test]
fn test_valid_defensive_tactic() {
    let tactic = 0; // Defensive
    let player_secret = 12345;
    let session_id = 1;
    let commitment = main(tactic, player_secret, session_id);
    assert(commitment != 0);
}

#[test]
fn test_valid_allout_tactic() {
    let tactic = 3; // AllOut
    let player_secret = 99999;
    let session_id = 42;
    let commitment = main(tactic, player_secret, session_id);
    assert(commitment != 0);
}

#[test(should_fail_with = "Tactic must be between 0 and 3")]
fn test_invalid_tactic_too_high() {
    let tactic = 4; // Invalid
    let player_secret = 12345;
    let session_id = 1;
    let _commitment = main(tactic, player_secret, session_id);
}

#[test]
fn test_different_tactics_different_commitments() {
    let player_secret = 12345;
    let session_id = 1;
    
    let commit0 = main(0, player_secret, session_id);
    let commit1 = main(1, player_secret, session_id);
    let commit2 = main(2, player_secret, session_id);
    let commit3 = main(3, player_secret, session_id);
    
    assert(commit0 != commit1);
    assert(commit1 != commit2);
    assert(commit2 != commit3);
}
