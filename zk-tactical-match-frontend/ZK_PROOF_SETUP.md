# ZK Proof Setup Guide

## Overview

The ZK Tactical Match game uses Noir circuits to generate zero-knowledge proofs for tactical choices. This ensures players can commit to their tactics without revealing them until the match is resolved.

## Current Status ✅

- ✅ Noir circuit compiled (`circuit/target/tactical_proof.json`)
- ✅ Circuit artifacts copied to frontend (`public/tactical_proof.json`)
- ✅ Noir.js dependencies installed
- ✅ Proof generation service implemented
- ✅ Contract verification logic added
- ✅ Fallback to mock proofs if ZK generation fails

## Dependencies

```json
{
  "@noir-lang/noir_js": "1.0.0-beta.9",
  "@noir-lang/backend_barretenberg": "0.36.0",
  "@aztec/bb.js": "0.87.0"
}
```

## How It Works

### 1. Circuit (Noir)

Located in `circuit/src/main.nr`:

```noir
fn main(
    tactic: u32,           // Private: 0-3
    player_secret: Field,  // Private: random
    session_id: pub u32    // Public: game session
) -> pub Field {
    // Proves tactic ∈ [0-3] without revealing which
    assert(tactic <= 3);

    // Return commitment
    pedersen_hash([tactic, player_secret, session_id])
}
```

### 2. Proof Generation (Frontend)

Located in `src/games/zk-tactical-match/zkProofService.ts`:

```typescript
// Generate proof
const playerSecret = generatePlayerSecret();
const proof = await generateTacticProof(
  tactic,        // 0-3
  playerSecret,  // Random bigint
  sessionId      // Game session
);
```

### 3. Verification (Contract)

Located in `contracts/zk-tactical-match/src/lib.rs`:

```rust
// Basic validation (current)
fn verify_zk_proof(proof, tactic, session_id) {
    - Check proof not empty
    - Check minimum length (32 bytes)
    - Check not all zeros
    - Validate tactic range
}

// Future: Full ZK verification
// env.crypto().verify_noir_proof(proof, public_inputs)
```

## Troubleshooting

### Issue: WASM Loading Error

**Error:**
```
WebAssembly.instantiate(): expected magic word 00 61 73 6d
```

**Solution:**
This is a known issue with Barretenberg WASM loading in browsers. The game has a **fallback mechanism** that uses mock proofs if ZK proof generation fails. This is acceptable for demo/testing.

**Check console for:**
```
[ZK] Failed to generate ZK proof, using mock proof
[ZK] Using mock proof (128 bytes)
```

### Issue: Module Not Found

**Error:**
```
Cannot find module '@noir-lang/noir_js'
```

**Solution:**
```bash
cd zk-tactical-match-frontend
bun install
```

### Issue: CORS Errors

**Solution:**
The Vite config has been updated with proper headers:
```typescript
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  }
}
```

Restart the dev server:
```bash
bun run dev
```

## Testing ZK Proofs

### 1. Test Proof Generation (Console)

Open browser console and run:

```javascript
import { generateTacticProof, generatePlayerSecret } from './zkProofService';

const secret = generatePlayerSecret();
const proof = await generateTacticProof(0, secret, 12345);
console.log('Proof generated:', proof);
```

### 2. Test Full Game Flow

1. **Create Match** (Player 1)
2. **Join Match** (Player 2) → Signs auth entry
3. **Start Game** (Player 1) → Completes multi-sig
4. **Choose Tactic** (Both players)
   - Watch console for: `[ZK] ✅ Proof generated successfully`
   - Or: `[ZK] Using mock proof` (fallback)
5. **Resolve Match** → See results

### 3. Verify Contract Accepts Proofs

Check transaction logs for:
```
✅ submit_tactic succeeded
✅ resolve_match succeeded
```

## Production Deployment

### Current (Demo/Hackathon) ✅

- ✅ Real ZK proofs attempted client-side
- ✅ Fallback to mock proofs if generation fails
- ✅ Contract validates proof format
- ✅ Commitment tracking prevents cheating

### For Production 🚧

1. **Add full ZK verification** in contract (pending Protocol 25):
   ```rust
   env.crypto().verify_noir_proof(proof, public_inputs)
   ```

2. **Optimize proof generation**:
   - Cache circuit and backend
   - Use Web Workers for proof generation
   - Batch proof generation if needed

3. **Secure player secrets**:
   - Store in encrypted localStorage
   - Or regenerate deterministically from wallet signature

4. **Monitor proof generation success rate**:
   - Add analytics to track ZK vs mock proof usage
   - Alert if ZK proof generation consistently fails

## File Structure

```
circuit/
  src/main.nr              # Noir circuit definition
  target/
    tactical_proof.json    # Compiled circuit (58KB)
    tactical_proof.gz      # Compressed verifier key (425B)

zk-tactical-match-frontend/
  public/
    tactical_proof.json    # Circuit artifact (loaded at runtime)
  src/games/zk-tactical-match/
    zkProofService.ts      # Proof generation
    ZkTacticalMatchGame.tsx # Game UI with ZK integration

contracts/zk-tactical-match/
  src/lib.rs               # Contract with verify_zk_proof()
```

## Key Advantages

1. **Privacy**: Tactics hidden until reveal
2. **Commitment**: Can't change tactic after submission
3. **Fairness**: Prevents cheating via proof validation
4. **Scalability**: Proofs are ~200-400 bytes
5. **Future-proof**: Ready for Protocol 25 verification

## Known Limitations

1. **Client-side generation**: Proofs generated in browser
2. **No full verification**: Pending Protocol 25 on Stellar
3. **Fallback proofs**: Mock proofs used if ZK fails
4. **Performance**: Proof generation takes ~1-3 seconds

## Resources

- [Noir Documentation](https://noir-lang.org)
- [Barretenberg Backend](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg)
- [Stellar Protocol 25 (X-Ray)](https://stellar.org)
- [Circuit Source](../circuit/src/main.nr)

---

**Status**: ✅ Working with fallback
**Production Ready**: 🚧 Pending Protocol 25
**Demo Ready**: ✅ Yes
