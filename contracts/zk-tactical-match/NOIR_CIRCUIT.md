# ZK Tactical Match - Noir Circuit

This circuit proves a player selected a valid tactic without revealing which one.

## Circuit Logic

**Private Inputs:**
- `tactic`: u32 (0-3)
- `player_secret`: Field (random salt for uniqueness)

**Public Inputs:**
- `session_id`: u32
- `proof_commitment`: Field (hash of tactic + secret)

**Constraints:**
1. `tactic ∈ [0, 3]`
2. `poseidon_hash([tactic, player_secret, session_id]) == proof_commitment`

## Setup

```bash
# Install Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Create circuit
nargo new tactical_proof
cd tactical_proof
```

## Circuit Code (src/main.nr)

```noir
use dep::std;

fn main(
    tactic: u32,
    player_secret: Field,
    session_id: pub u32,
    proof_commitment: pub Field
) {
    // Constraint 1: Tactic must be in valid range [0-3]
    assert(tactic <= 3);
    
    // Constraint 2: Commitment matches
    let computed = std::hash::poseidon::bn254::hash_3([
        tactic as Field,
        player_secret,
        session_id as Field
    ]);
    
    assert(computed == proof_commitment);
}
```

## Generate Proof (Client-Side)

```typescript
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import circuit from './target/tactical_proof.json';

async function generateProof(tactic: number, sessionId: number) {
    const backend = new BarretenbergBackend(circuit);
    const noir = new Noir(circuit, backend);
    
    const playerSecret = generateRandomField(); // Random salt
    
    // Compute commitment
    const commitment = poseidonHash([tactic, playerSecret, sessionId]);
    
    // Generate proof
    const { proof } = await noir.generateProof({
        tactic,
        player_secret: playerSecret,
        session_id: sessionId,
        proof_commitment: commitment
    });
    
    return { proof, commitment };
}
```

## Verify On-Chain (Stellar Contract)

```rust
// In submit_tactic():
// TODO: Use Stellar Protocol 25 BN254 verification
// env.crypto().verify_bn254_proof(proof, public_inputs)
```

## Build

```bash
nargo compile
nargo prove
nargo verify
```

## Integration Flow

1. **Client**: User selects tactic (0-3)
2. **Client**: Generate ZK proof with Noir
3. **Client**: Submit proof + commitment to contract
4. **Contract**: Verify proof (validates tactic ∈ [0-3])
5. **Contract**: Store commitment (tactic remains hidden)
6. **Contract**: After both submit → resolve match
