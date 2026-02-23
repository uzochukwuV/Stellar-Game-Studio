// Helper to compute commitment
// Run: nargo execute --package compute_commitment

use std::hash::pedersen_hash;

fn main() -> pub Field {
    let tactic = 2; // Aggressive
    let player_secret = 123456789012345678901234567890;
    let session_id = 1;
    
    let commitment = pedersen_hash([
        tactic as Field,
        player_secret,
        session_id as Field
    ]);
    
    commitment
}
