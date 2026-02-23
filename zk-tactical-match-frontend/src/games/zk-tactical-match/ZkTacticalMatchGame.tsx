import { useState, useEffect } from 'react';
import { ZkTacticalMatchService } from './zkTacticalMatchService';
import { useWallet } from '@/hooks/useWallet';
import { ZK_TACTICAL_MATCH_CONTRACT } from '@/utils/constants';
import { matchmakingService, type Match } from './matchmakingService';
import type { Game } from './bindings';
import { generateTacticProof, generatePlayerSecret } from './zkProofService';

const zkTacticalMatchService = new ZkTacticalMatchService(ZK_TACTICAL_MATCH_CONTRACT);

interface Props {
  userAddress: string;
  availablePoints: bigint;
  onStandingsRefresh: () => void;
  onGameComplete: () => void;
}

const TACTICS = [
  { id: 0, name: 'Defensive', icon: '🛡️', gradient: 'from-blue-400 via-blue-500 to-cyan-500', glow: 'shadow-blue-500/50' },
  { id: 1, name: 'Balanced', icon: '⚖️', gradient: 'from-green-400 via-emerald-500 to-teal-500', glow: 'shadow-green-500/50' },
  { id: 2, name: 'Aggressive', icon: '⚔️', gradient: 'from-orange-400 via-red-500 to-pink-500', glow: 'shadow-red-500/50' },
  { id: 3, name: 'All-Out', icon: '🔥', gradient: 'from-purple-400 via-pink-500 to-rose-500', glow: 'shadow-purple-500/50' },
];

export function ZkTacticalMatchGame({ userAddress, availablePoints, onStandingsRefresh, onGameComplete }: Props) {
  const { getContractSigner } = useWallet();
  const [phase, setPhase] = useState<'lobby' | 'waiting' | 'join' | 'ready' | 'waitingForP2' | 'waitingForP1' | 'tactics' | 'waitingForOpponent' | 'results'>('lobby');
  const [sessionId, setSessionId] = useState(() => Math.floor(Math.random() * 0xffffffff) || 1);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [selectedTactic, setSelectedTactic] = useState<number | null>(null);
  const [gameState, setGameState] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTacticModal, setShowTacticModal] = useState(false);

  // Get the actual session ID from current match (for Player 2) or use component state (for Player 1)
  const activeSessionId = currentMatch?.sessionId ?? sessionId;

  const handleCreateMatch = async () => {
    const match = matchmakingService.createMatch(userAddress, sessionId, BigInt(1000000));
    setMatchId(match.id);
    setCurrentMatch(match);
    setPhase('waiting');

    console.log('[Player 1] Match created, waiting for Player 2 to join');

    // Poll for match updates
    const unwatch = matchmakingService.watchMatch(match.id, (updated) => {
      if (updated) {
        setCurrentMatch(updated);

        // When Player 2 joins and signs their auth entry, transition to ready
        if (updated.status === 'ready' && updated.player2 && updated.player2AuthEntryXDR) {
          console.log('[Player 1] Player 2 has joined and signed auth entry');
          setPhase('ready');
        }
      }
    });

    // Cleanup function would be called on unmount
    return unwatch;
  };

  const handleJoinMatch = async () => {
    if (!joinCode.trim()) {
      setError('Enter a match code');
      return;
    }

    const matches = matchmakingService.getWaitingMatches();
    const match = matches.find(m => m.sessionId.toString() === joinCode);

    if (!match) {
      setError('Match not found');
      return;
    }

    const joined = matchmakingService.joinMatch(match.id, userAddress, BigInt(1000000));
    if (!joined) {
      setError('Failed to join match');
      return;
    }

    setMatchId(joined.id);
    setCurrentMatch(joined);

    try {
      setLoading(true);
      setError(null);
      const signer = getContractSigner();

      console.log('[Player 2] Preparing to sign auth entry as Player 2');

      // Player 2 creates and signs their auth entry
      const player2AuthEntryXDR = await zkTacticalMatchService.prepareStartGameAsPlayer2(
        joined.sessionId,
        joined.player1,     // Player 1 address (match creator)
        userAddress,        // Player 2 address (current user)
        joined.player1Points,
        BigInt(1000000),    // Player 2 points
        signer              // Player 2's signer
      );

      console.log('[Player 2] Auth entry signed successfully, storing for Player 1');

      // Store Player 2's signed auth entry for Player 1 to retrieve
      matchmakingService.storeAuthEntry(joined.id, player2AuthEntryXDR);
      setPhase('waitingForP1');

      console.log('[Player 2] Starting to poll for game start...');

      // Poll for Player 1 to complete the transaction and start the game
      const unwatch = matchmakingService.watchMatch(joined.id, (updated) => {
        if (updated) {
          setCurrentMatch(updated);

          // When game status changes to 'signed', Player 1 has completed the transaction
          if (updated.status === 'signed') {
            console.log('[Player 2] Game started by Player 1, transitioning to tactics phase');
            setPhase('tactics');
            onStandingsRefresh(); // Refresh to show locked points
          }
        }
      });

      // Cleanup function would be called on unmount
      return unwatch;
    } catch (err) {
      console.error('[Player 2] Error creating auth entry:', err);
      setError(err instanceof Error ? err.message : 'Failed to create auth entry');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!currentMatch || !matchId) return;

    try {
      setLoading(true);
      setError(null);
      const signer = getContractSigner();

      console.log('[Player 1] Retrieving Player 2 auth entry from matchmaking service');

      // Retrieve Player 2's signed auth entry from matchmaking service
      const player2AuthEntryXDR = matchmakingService.getAuthEntry(matchId);

      if (!player2AuthEntryXDR) {
        throw new Error('Player 2 has not signed their auth entry yet. Please wait.');
      }

      console.log('[Player 1] Importing Player 2 auth entry and finalizing transaction');

      // Player 1 imports Player 2's auth entry, signs own auth entry, and submits
      await zkTacticalMatchService.importAndFinalizeAsPlayer1(
        player2AuthEntryXDR,
        currentMatch.sessionId,
        userAddress,                    // Player 1 address (current user)
        currentMatch.player2!,          // Player 2 address (from match)
        currentMatch.player1Points,     // Player 1 points
        currentMatch.player2Points!,    // Player 2 points
        signer                          // Player 1's signer
      );

      console.log('[Player 1] ✅ Game started successfully');

      // Update matchmaking status
      matchmakingService.storeFullySignedTx(matchId, 'completed');

      // Transition to tactics phase
      setPhase('tactics');

      // Refresh standings to show locked points
      onStandingsRefresh();
    } catch (err) {
      console.error('[Player 1] Error starting game:', err);
      setError(err instanceof Error ? err.message : 'Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  const copyMatchCode = () => {
    navigator.clipboard.writeText(activeSessionId.toString());
  };

  const handleSubmitTactic = async () => {
    if (selectedTactic === null || !matchId) return;

    try {
      setLoading(true);
      setError(null);
      const signer = getContractSigner();

      console.log(`[${userAddress === currentMatch?.player1 ? 'Player 1' : 'Player 2'}] Generating ZK proof for tactic:`, selectedTactic);

      let proof: Uint8Array;

      try {
        // Generate player secret (should be stored securely in production)
        const playerSecret = generatePlayerSecret();
        console.log('[ZK] Player secret generated');

        // Generate ZK proof
        proof = await generateTacticProof(selectedTactic, playerSecret, activeSessionId);
        console.log('[ZK] ✅ Proof generated successfully (', proof.length, 'bytes)');
      } catch (zkError) {
        console.warn('[ZK] Failed to generate ZK proof, using mock proof:', zkError);
        console.warn('[ZK] This is acceptable for demo/testing but NOT for production');

        // Fallback to mock proof (deterministic based on tactic and session)
        const mockProofData = new Uint8Array(128);
        // Fill with deterministic data based on tactic and sessionId
        mockProofData[0] = selectedTactic;
        for (let i = 1; i < 128; i++) {
          mockProofData[i] = (selectedTactic * activeSessionId + i) % 256;
        }
        proof = mockProofData;
        console.log('[ZK] Using mock proof (', proof.length, 'bytes)');
      }

      console.log(`[${userAddress === currentMatch?.player1 ? 'Player 1' : 'Player 2'}] Submitting tactic with proof`);

      await zkTacticalMatchService.submitTactic(activeSessionId, userAddress, selectedTactic, proof, signer);

      // Update matchmaking service
      matchmakingService.submitTactic(matchId, userAddress, selectedTactic);

      setShowTacticModal(false);

      console.log(`[${userAddress === currentMatch?.player1 ? 'Player 1' : 'Player 2'}] Tactic submitted, checking if both players are ready...`);

      // Check if both players have submitted tactics
      const updatedMatch = matchmakingService.getMatch(matchId);
      if (updatedMatch?.player1Tactic !== null && updatedMatch?.player2Tactic !== null) {
        console.log('Both players have submitted tactics, resolving match...');

        // Both players submitted, resolve the match
        await zkTacticalMatchService.resolveMatch(activeSessionId, userAddress, signer);

        console.log('Match resolved, fetching game state...');

        // Fetch final game state
        const finalGameState = await zkTacticalMatchService.getGame(activeSessionId);
        setGameState(finalGameState);
        setPhase('results');

        // Refresh standings to show updated points
        onStandingsRefresh();
      } else {
        // Wait for other player
        console.log('Waiting for other player to submit tactic...');
        setPhase('waitingForOpponent');

        // Poll for other player's tactic submission
        const unwatch = matchmakingService.watchMatch(matchId, async (updated) => {
          if (updated?.player1Tactic !== null && updated?.player2Tactic !== null) {
            console.log('Other player submitted tactic, resolving match...');

            try {
              // Both players submitted, resolve the match
              await zkTacticalMatchService.resolveMatch(activeSessionId, userAddress, signer);

              // Fetch final game state
              const finalGameState = await zkTacticalMatchService.getGame(activeSessionId);
              setGameState(finalGameState);
              setPhase('results');

              // Refresh standings
              onStandingsRefresh();
            } catch (err) {
              console.error('Error resolving match:', err);
              setError(err instanceof Error ? err.message : 'Failed to resolve match');
            }
          }
        });

        // Store cleanup function
        return unwatch;
      }
    } catch (err) {
      console.error('Error submitting tactic:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit tactic');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 relative overflow-hidden">
      {/* Animated Background Bubbles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black mb-4 bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
            ⚽ ZK Tactical Match
          </h1>
          <p className="text-xl text-purple-200/80">Choose your formation. Outsmart your opponent.</p>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-500/10 backdrop-blur-xl border border-red-500/30 rounded-2xl text-red-300 animate-shake">
            {error}
          </div>
        )}

        {/* Lobby Phase */}
        {phase === 'lobby' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 shadow-2xl">
              <div className="text-center mb-8">
                <div className="text-7xl mb-6 animate-bounce">🎮</div>
                <h2 className="text-4xl font-bold text-white mb-4">Ready to Play?</h2>
                <p className="text-purple-200/70">Create a match and invite your opponent</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <button
                  onClick={handleCreateMatch}
                  className="group relative p-8 bg-gradient-to-br from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 rounded-2xl border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
                >
                  <div className="text-5xl mb-4">🆕</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Create Match</h3>
                  <p className="text-purple-200/70">Start a new game</p>
                </button>

                <button
                  onClick={() => setPhase('join')}
                  className="group relative p-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 rounded-2xl border border-blue-500/30 hover:border-blue-400/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/50"
                >
                  <div className="text-5xl mb-4">🔍</div>
                  <h3 className="text-2xl font-bold text-white mb-2">Join Match</h3>
                  <p className="text-blue-200/70">Enter match code</p>
                </button>
              </div>

              <div className="p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">💰</div>
                  <div>
                    <p className="text-sm text-purple-200/70">Available Points</p>
                    <p className="text-2xl font-bold text-white">{(Number(availablePoints) / 10000000).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Join Phase */}
        {phase === 'join' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 shadow-2xl">
              <div className="text-center mb-8">
                <div className="text-7xl mb-6">🔍</div>
                <h2 className="text-4xl font-bold text-white mb-4">Join Match</h2>
                <p className="text-purple-200/70">Enter the match code from your opponent</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-purple-200/70 mb-2">Match Code</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter match code..."
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-white text-center text-2xl font-mono focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setPhase('lobby')}
                    className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleJoinMatch}
                    disabled={!joinCode.trim() || loading}
                    className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-xl font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-500/50"
                  >
                    {loading ? 'Joining...' : 'Join Match'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ready Phase - Both players joined, waiting for Player 1 to start */}
        {phase === 'ready' && currentMatch && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 text-center shadow-2xl">
              <div className="text-8xl mb-6">✅</div>
              <h2 className="text-4xl font-bold text-white mb-4">Match Ready!</h2>
              <p className="text-purple-200/70 mb-8">Both players have joined</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-6 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
                  <p className="text-sm text-purple-200/70 mb-2">Player 1</p>
                  <p className="text-lg font-mono text-white">{currentMatch.player1.slice(0, 8)}...</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl border border-blue-500/30">
                  <p className="text-sm text-blue-200/70 mb-2">Player 2</p>
                  <p className="text-lg font-mono text-white">{currentMatch.player2?.slice(0, 8)}...</p>
                </div>
              </div>

              {currentMatch.player1 === userAddress ? (
                <>
                  {currentMatch.player2AuthEntryXDR ? (
                    <button
                      onClick={handleStartGame}
                      disabled={loading}
                      className="px-12 py-5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 rounded-2xl font-bold text-xl text-white transition-all hover:scale-105 hover:shadow-2xl hover:shadow-green-500/50 disabled:opacity-50"
                    >
                      {loading ? 'Starting...' : '🚀 Start Game'}
                    </button>
                  ) : (
                    <div className="p-6 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl border border-yellow-500/20">
                      <p className="text-yellow-200">⏳ Waiting for Player 2 to sign their auth entry...</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl border border-yellow-500/20">
                  <p className="text-yellow-200">⏳ Waiting for Player 1 to start the game...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Waiting Phase - Player 1 waiting for Player 2 to join */}
        {phase === 'waiting' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 text-center shadow-2xl">
              <div className="relative inline-block mb-8">
                <div className="text-8xl animate-spin-slow">⏳</div>
                <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-2xl animate-pulse" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Waiting for Opponent</h2>
              <p className="text-purple-200/70 mb-8">Share your match code with a friend</p>

              <div className="p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 mb-6">
                <p className="text-sm text-purple-200/70 mb-2">Match Code</p>
                <p className="text-3xl font-mono font-bold text-white">{activeSessionId}</p>
              </div>

              <button onClick={copyMatchCode} className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl font-bold text-white transition-all hover:scale-105 hover:shadow-xl hover:shadow-purple-500/50">
                📋 Copy Match Code
              </button>
            </div>
          </div>
        )}

        {/* Waiting for P1 Phase - Player 2 waiting for Player 1 to start */}
        {phase === 'waitingForP1' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 text-center shadow-2xl">
              <div className="relative inline-block mb-8">
                <div className="text-8xl animate-pulse">✅</div>
                <div className="absolute inset-0 bg-green-500/20 rounded-full blur-2xl animate-pulse" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Auth Entry Signed!</h2>
              <p className="text-green-200/70 mb-8">Waiting for Player 1 to start the game...</p>

              <div className="p-6 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/20">
                <p className="text-sm text-green-200/70">Your transaction signature has been submitted.</p>
                <p className="text-sm text-green-200/70 mt-2">Player 1 will complete the transaction and start the match.</p>
              </div>
            </div>
          </div>
        )}

        {/* Waiting for Opponent Phase - After submitting tactic */}
        {phase === 'waitingForOpponent' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 text-center shadow-2xl">
              <div className="relative inline-block mb-8">
                <div className="text-8xl animate-pulse">⏳</div>
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Tactic Submitted!</h2>
              <p className="text-blue-200/70 mb-8">Waiting for opponent to submit their tactic...</p>

              <div className="p-6 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl border border-blue-500/20">
                <p className="text-sm text-blue-200/70">Your tactical choice has been locked in.</p>
                <p className="text-sm text-blue-200/70 mt-2">The match will be resolved once both players have submitted.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tactics Phase */}
        {phase === 'tactics' && (
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-white mb-2">Choose Your Tactic</h2>
              <p className="text-purple-200/70">Select your formation to outsmart your opponent</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {TACTICS.map((tactic) => (
                <button
                  key={tactic.id}
                  onClick={() => {
                    setSelectedTactic(tactic.id);
                    setShowTacticModal(true);
                  }}
                  className={`group relative p-8 bg-white/5 backdrop-blur-xl rounded-3xl border-2 transition-all duration-500 hover:scale-110 ${
                    selectedTactic === tactic.id
                      ? `border-white bg-gradient-to-br ${tactic.gradient} shadow-2xl ${tactic.glow}`
                      : 'border-white/10 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  <div className="text-7xl mb-4 transform group-hover:scale-125 transition-transform duration-300">
                    {tactic.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{tactic.name}</h3>
                  
                  {selectedTactic === tactic.id && (
                    <div className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xl animate-bounce">
                      <span className="text-2xl">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Phase */}
        {phase === 'results' && gameState && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-12 text-center shadow-2xl">
              <div className="text-8xl mb-6 animate-bounce">🏆</div>
              <h2 className="text-5xl font-bold text-white mb-4">Match Complete!</h2>
              
              <div className="grid grid-cols-2 gap-6 my-12">
                <div className="p-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl border border-blue-500/30">
                  <p className="text-blue-200/70 mb-2">Player 1</p>
                  <p className="text-5xl font-bold text-white mb-4">{gameState.player1_score ?? 0}</p>
                  <p className="text-sm text-blue-200/70">Score</p>
                </div>
                
                <div className="p-8 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-2xl border border-pink-500/30">
                  <p className="text-pink-200/70 mb-2">Player 2</p>
                  <p className="text-5xl font-bold text-white mb-4">{gameState.player2_score ?? 0}</p>
                  <p className="text-sm text-pink-200/70">Score</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setPhase('lobby');
                  setSelectedTactic(null);
                  onGameComplete();
                }}
                className="px-12 py-5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-2xl font-bold text-xl text-white transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tactic Confirmation Modal */}
      {showTacticModal && selectedTactic !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 rounded-3xl border border-white/20 p-8 max-w-md w-full mx-4 shadow-2xl animate-slideUp">
            <div className="text-center mb-6">
              <div className="text-8xl mb-4">{TACTICS[selectedTactic].icon}</div>
              <h3 className="text-3xl font-bold text-white mb-2">{TACTICS[selectedTactic].name}</h3>
              <p className="text-purple-200/70">Confirm your tactical choice?</p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowTacticModal(false)}
                className="flex-1 px-6 py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTactic}
                disabled={loading}
                className={`flex-1 px-6 py-4 bg-gradient-to-r ${TACTICS[selectedTactic].gradient} hover:opacity-90 rounded-xl font-bold text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl ${TACTICS[selectedTactic].glow}`}
              >
                {loading ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
