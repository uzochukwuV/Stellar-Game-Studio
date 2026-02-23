# ZK Tactical Match - Example Proof Generation

## Step 1: Compute Commitment

First, we need to compute the commitment hash. Create a simple test:

```noir
use std::hash::pedersen_hash;

let tactic = 2;
let player_secret = 123456789012345678901234567890;
let session_id = 1;

let commitment = pedersen_hash([
    tactic as Field,
    player_secret,
    session_id as Field
]);
// commitment will be printed during execution
```

## Step 2: Update Prover.toml

Use the computed commitment in `Prover.toml`:

```toml
tactic = "2"
player_secret = "123456789012345678901234567890"
session_id = "1"
proof_commitment = "<computed_hash_here>"
```

## Step 3: Execute

```bash
nargo execute
```

## For Frontend Integration

In production, the frontend will:
1. User selects tactic (0-3)
2. Generate random player_secret
3. Compute commitment = pedersen_hash([tactic, secret, session_id])
4. Generate ZK proof with Noir.js
5. Submit proof + commitment to contract
6. Contract verifies proof validates tactic ∈ [0,3]
7. Tactic remains hidden until both players submit
