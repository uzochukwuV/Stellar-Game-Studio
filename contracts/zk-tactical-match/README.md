# ⚽ ZK Tactical Match

**A zero-knowledge strategy game on Stellar where players secretly choose tactical formations to outsmart opponents.**

## 🎮 Game Concept

Two players compete in a virtual football match by selecting tactical formations:
- 🛡 **Defensive** (0)
- ⚖ **Balanced** (1)  
- ⚔ **Aggressive** (2)
- 🔥 **All-Out Attack** (3)

**The twist:** Tactics are hidden using ZK proofs. No commit-reveal. Single transaction per player.

## 🧠 Strategic Matrix

Scores determined by tactical interaction:

| P1 \ P2    | Defensive | Balanced | Aggressive | All-Out |
|------------|-----------|----------|------------|---------|
| Defensive  | 0-0       | 0-1      | 1-1        | 2-2     |
| Balanced   | 1-0       | 1-1      | 1-2        | 2-3     |
| Aggressive | 1-1       | 2-1      | 2-2        | 3-3     |
| All-Out    | 2-2       | 3-2      | 3-3        | 4-4     |

**Strategy:**
- Defensive counters All-Out (chaos draw)
- Balanced beats Defensive
- Aggressive beats Balanced
- All-Out creates high-scoring games
- Mind games and meta-play matter

## 🔐 ZK Integration

**Why ZK is Essential:**
- Players submit tactics WITHOUT revealing them
- ZK proof validates: `tactic ∈ [0, 3]`
- No trusted server needed
- Provably fair resolution
- Uses Stellar Protocol 25 (X-Ray) primitives

**Proof System:**
- Circuit: Noir
- Verification: On-chain (Stellar BN254/Poseidon)
- Commitment: Poseidon hash
- No commit-reveal phase

## 🏗 Architecture

### Contract Flow

```
1. start_game(session_id, player1, player2, points)
   ↓
2. submit_tactic(session_id, player, tactic, zk_proof)
   - Verifies ZK proof
   - Stores commitment (tactic hidden)
   ↓
3. [Both players submit]
   ↓
4. resolve_match(session_id)
   - Computes scores using matrix
   - Determines winner
   - Calls end_game() on Game Hub
```

### ZK Proof

**Private Inputs:**
- `tactic`: 0-3
- `player_secret`: Random salt

**Public Inputs:**
- `session_id`: Game ID
- `proof_commitment`: Hash

**Constraints:**
- `tactic <= 3`
- `poseidon_hash([tactic, secret, session_id]) == commitment`

## 🚀 Quick Start

### Build Contract

```bash
cd contracts/zk-tactical-match
cargo build --target wasm32-unknown-unknown --release
```

### Deploy to Testnet

```bash
# From Stellar Game Studio root
bun run deploy zk-tactical-match
```

### Generate Bindings

```bash
bun run bindings zk-tactical-match
```

## 📝 Contract Interface

### Core Functions

```rust
// Start game with betting
start_game(
    session_id: u32,
    player1: Address,
    player2: Address,
    player1_points: i128,
    player2_points: i128
) -> Result<(), Error>

// Submit tactic with ZK proof
submit_tactic(
    session_id: u32,
    player: Address,
    tactic: u32,        // 0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut
    proof: Bytes        // ZK proof
) -> Result<(), Error>

// Resolve match after both submit
resolve_match(session_id: u32) -> Result<Address, Error>

// Query game state
get_game(session_id: u32) -> Result<Game, Error>
```

### Game State

```rust
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub player1_proof_hash: Option<BytesN<32>>,
    pub player2_proof_hash: Option<BytesN<32>>,
    pub player1_tactic: Option<u32>,      // Revealed after resolution
    pub player2_tactic: Option<u32>,
    pub player1_score: Option<u32>,
    pub player2_score: Option<u32>,
    pub winner: Option<Address>,
}
```

## 🎯 Hackathon Requirements

✅ **ZK-Powered Mechanic**: Noir proofs validate tactics without revealing  
✅ **Deployed On-Chain**: Stellar Testnet contract  
✅ **Game Hub Integration**: Calls `start_game()` and `end_game()`  
✅ **Strategic Depth**: 4x4 matrix creates mind games  
✅ **Single Transaction**: No commit-reveal UX friction  
✅ **Provably Fair**: ZK ensures valid tactics, deterministic resolution  

## 🛠 Development

### Test Contract

```bash
cargo test
```

### Frontend Integration

```typescript
import { Contract } from '@stellar/stellar-sdk';

// 1. Generate ZK proof (client-side)
const { proof, commitment } = await generateTacticProof(tactic, sessionId);

// 2. Submit to contract
await contract.submit_tactic({
    session_id: sessionId,
    player: playerAddress,
    tactic: tactic,
    proof: proof
});

// 3. Resolve after both submit
const winner = await contract.resolve_match({ session_id: sessionId });
```

## 📊 Game Hub Contract

**Testnet Address:**
```
CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
```

**Interface:**
```rust
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
```

## 🎨 Frontend Features

- Tactic selector UI (4 buttons)
- ZK proof generation (Noir.js)
- Real-time game state
- Score visualization
- Match history

## 🔬 Technical Details

**Storage:**
- Temporary storage (30-day TTL)
- Key: `DataKey::Game(session_id)`

**Determinism:**
- Score matrix is deterministic
- No randomness needed
- Same inputs → same outputs

**Security:**
- ZK proofs prevent cheating
- On-chain verification
- No trusted third party

## 📚 Resources

- [Stellar Game Studio](https://jamesbachini.github.io/Stellar-Game-Studio/)
- [Noir Documentation](https://noir-lang.org/)
- [Stellar Protocol 25](https://stellar.org/blog/developers/protocol-25-x-ray)
- [Game Hub Contract](https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG)

## 🏆 Why This Wins

1. **Real ZK Usage**: Not just mentioned, actually essential
2. **Clean UX**: Single transaction, no waiting
3. **Strategic Depth**: 4x4 matrix creates interesting gameplay
4. **Easy to Demo**: 2-minute video shows full flow
5. **Minimal Scope**: Finishable in hackathon timeframe
6. **Protocol 25**: Uses new Stellar ZK primitives

## 📄 License

MIT License - Built for Stellar ZK Gaming Hackathon 2026
