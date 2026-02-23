# ZK Tactical Match - Noir Circuit

This Noir circuit proves a player selected a valid tactical formation (0-3) without revealing which one.

## Circuit Logic

### Private Inputs (Hidden)
- `tactic`: u32 (0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut)
- `player_secret`: Field (random salt for uniqueness)

### Public Inputs (Visible)
- `session_id`: u32 (game session identifier)
- `proof_commitment`: Field (Poseidon2 hash of tactic + secret + session)

### Constraints
1. **Valid Range**: `tactic ∈ [0, 3]`
2. **Commitment Match**: `Poseidon2([tactic, secret, session_id]) == commitment`

## Build & Test

```bash
# Test the circuit
nargo test

# Compile the circuit
nargo compile

# Generate proof (requires Prover.toml with inputs)
nargo prove

# Verify proof
nargo verify
```

## Example Usage

### 1. Generate Commitment (Client-Side)

```typescript
import { Poseidon2 } from '@noir-lang/noir_js';

const tactic = 2; // Aggressive
const playerSecret = generateRandomField();
const sessionId = 1;

const commitment = Poseidon2.hash([tactic, playerSecret, sessionId]);
```

### 2. Generate Proof (Client-Side)

Create `Prover.toml`:
```toml
tactic = "2"
player_secret = "12345678901234567890"
session_id = "1"
proof_commitment = "0x..."
```

Then:
```bash
nargo prove
```

### 3. Submit to Contract (On-Chain)

```typescript
const proof = fs.readFileSync('./proofs/tactical_proof.proof');

await contract.submit_tactic({
    session_id: sessionId,
    player: playerAddress,
    tactic: tactic,
    proof: proof
});
```

### 4. Verify On-Chain (Stellar Contract)

The contract verifies the proof using Stellar Protocol 25 primitives:
```rust
// TODO: Full BN254 verification
// env.crypto().verify_bn254_proof(proof, public_inputs)

// Current: Hash-based validation for MVP
let proof_hash = env.crypto().keccak256(&proof).into();
```

## Integration with Stellar

### Current (Hackathon MVP)
- Hash-based proof validation
- Proves tactic was committed
- Simple and fast

### Future (Production)
- Full BN254 curve verification
- Uses Stellar Protocol 25 X-Ray primitives
- On-chain ZK proof verification

## Why Poseidon2?

- **Efficient**: Optimized for ZK circuits
- **Secure**: Cryptographically sound hash function
- **Stellar Compatible**: Protocol 25 supports Poseidon primitives
- **Small Proofs**: Generates compact proofs

## Testing

Run all tests:
```bash
nargo test
```

Expected output:
```
[tactical_proof] Running 4 test functions
[tactical_proof] Testing test_valid_defensive_tactic... ok
[tactical_proof] Testing test_valid_allout_tactic... ok
[tactical_proof] Testing test_invalid_tactic_too_high... ok
[tactical_proof] Testing test_wrong_commitment... ok
```

## Security Properties

✅ **Hiding**: Tactic remains private until resolution  
✅ **Binding**: Cannot change tactic after commitment  
✅ **Soundness**: Invalid tactics are rejected  
✅ **Completeness**: Valid tactics always verify  

## Next Steps

1. Test circuit: `nargo test`
2. Compile: `nargo compile`
3. Integrate with frontend (Noir.js)
4. Deploy contract to Stellar testnet
5. Build UI for tactic selection + proof generation
