/**
 * ZK Proof Generation Service using Noir
 *
 * Generates zero-knowledge proofs for tactical choices using the Noir circuit.
 * Proves that a player selected a valid tactic (0-3) without revealing which one.
 */

import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend, type CompiledCircuit } from '@noir-lang/backend_barretenberg';

// Cache for circuit and backend to avoid reloading
let cachedCircuit: CompiledCircuit | null = null;
let cachedBackend: BarretenbergBackend | null = null;
let cachedNoir: Noir | null = null;

/**
 * Initialize the Noir circuit and backend
 * This loads the compiled circuit from the public folder
 */
async function initializeCircuit(): Promise<{ noir: Noir; backend: BarretenbergBackend }> {
  if (cachedNoir && cachedBackend) {
    console.log('[zkProofService] Using cached circuit and backend');
    return { noir: cachedNoir, backend: cachedBackend };
  }

  console.log('[zkProofService] Loading circuit from /tactical_proof.json');

  try {
    // Load the compiled circuit
    const response = await fetch('/tactical_proof.json');
    if (!response.ok) {
      throw new Error(`Failed to load circuit: ${response.statusText}`);
    }

    cachedCircuit = await response.json();
    console.log('[zkProofService] Circuit loaded successfully');

    // Initialize Noir instance
    cachedNoir = new Noir(cachedCircuit);
    console.log('[zkProofService] Noir instance created');

    // Initialize Barretenberg backend with proper WASM path configuration
    // The backend will automatically download WASM files from unpkg CDN
    cachedBackend = new BarretenbergBackend(cachedCircuit, {
      // Let Barretenberg use its default CDN for WASM files
      threads: 1, // Use single thread for compatibility
    });

    console.log('[zkProofService] Barretenberg backend initialized');

    return { noir: cachedNoir, backend: cachedBackend };
  } catch (error) {
    console.error('[zkProofService] Error initializing circuit:', error);
    throw new Error(`Failed to initialize ZK circuit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a ZK proof for a tactical choice
 *
 * @param tactic - The tactical choice (0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut)
 * @param playerSecret - A secret number chosen by the player (for commitment)
 * @param sessionId - The game session ID
 * @returns Proof as Uint8Array
 */
export async function generateTacticProof(
  tactic: number,
  playerSecret: bigint,
  sessionId: number
): Promise<Uint8Array> {
  console.log('[zkProofService] Generating proof for tactic:', tactic, 'session:', sessionId);

  // Validate inputs
  if (tactic < 0 || tactic > 3) {
    throw new Error('Tactic must be between 0 and 3');
  }

  if (sessionId <= 0) {
    throw new Error('Session ID must be positive');
  }

  try {
    // Initialize circuit and backend
    const { noir, backend } = await initializeCircuit();

    console.log('[zkProofService] Executing circuit with inputs:', {
      tactic,
      player_secret: playerSecret.toString(),
      session_id: sessionId,
    });

    // Execute the circuit to generate witness
    const { witness } = await noir.execute({
      tactic,
      player_secret: playerSecret.toString(),
      session_id: sessionId,
    });

    console.log('[zkProofService] Witness generated, creating proof...');

    // Generate the proof
    const proof = await backend.generateProof(witness);

    console.log('[zkProofService] ✅ Proof generated successfully (length:', proof.proof.length, 'bytes)');

    return proof.proof;
  } catch (error) {
    console.error('[zkProofService] Error generating proof:', error);
    throw new Error(`Failed to generate ZK proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify a ZK proof (optional, mainly for testing)
 *
 * @param proof - The proof to verify
 * @param publicInputs - The public inputs (session_id, commitment)
 * @returns True if proof is valid
 */
export async function verifyTacticProof(
  proof: Uint8Array,
  publicInputs: {
    session_id: number;
  }
): Promise<boolean> {
  console.log('[zkProofService] Verifying proof...');

  try {
    const { backend } = await initializeCircuit();

    const isValid = await backend.verifyProof({
      proof,
      publicInputs: {
        session_id: publicInputs.session_id.toString(),
      },
    });

    console.log('[zkProofService] Proof verification result:', isValid);
    return isValid;
  } catch (error) {
    console.error('[zkProofService] Error verifying proof:', error);
    return false;
  }
}

/**
 * Generate a random player secret
 * This should be stored securely and not shared
 *
 * @returns A random bigint to use as player_secret
 */
export function generatePlayerSecret(): bigint {
  // Generate a random 32-byte value
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Convert to bigint
  let secret = 0n;
  for (let i = 0; i < randomBytes.length; i++) {
    secret = (secret << 8n) | BigInt(randomBytes[i]);
  }

  return secret;
}
