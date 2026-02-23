// Simple matchmaking service using localStorage for hackathon MVP
// In production: Replace with real database (Supabase, Firebase, etc.)

export interface Match {
  id: string;
  sessionId: number;
  player1: string;
  player2: string | null;
  player1Points: bigint;
  player2Points: bigint | null;
  status: 'waiting' | 'ready' | 'playing' | 'complete';
  player1Tactic: number | null;
  player2Tactic: number | null;
  createdAt: number;
}

class MatchmakingService {
  private STORAGE_KEY = 'zk_tactical_matches';

  private getMatches(): Match[] {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data, (key, value) => {
      if (key.includes('Points') && value !== null) {
        return BigInt(value);
      }
      return value;
    }) : [];
  }

  private saveMatches(matches: Match[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(matches, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
  }

  createMatch(player1: string, sessionId: number, points: bigint): Match {
    const matches = this.getMatches();
    const match: Match = {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      player1,
      player2: null,
      player1Points: points,
      player2Points: null,
      status: 'waiting',
      player1Tactic: null,
      player2Tactic: null,
      createdAt: Date.now(),
    };
    matches.push(match);
    this.saveMatches(matches);
    return match;
  }

  joinMatch(matchId: string, player2: string, points: bigint): Match | null {
    const matches = this.getMatches();
    const match = matches.find(m => m.id === matchId && m.status === 'waiting');
    if (!match || match.player1 === player2) return null;
    
    match.player2 = player2;
    match.player2Points = points;
    match.status = 'ready';
    this.saveMatches(matches);
    return match;
  }

  getMatch(matchId: string): Match | null {
    return this.getMatches().find(m => m.id === matchId) || null;
  }

  getWaitingMatches(): Match[] {
    return this.getMatches().filter(m => m.status === 'waiting');
  }

  submitTactic(matchId: string, player: string, tactic: number): Match | null {
    const matches = this.getMatches();
    const match = matches.find(m => m.id === matchId);
    if (!match) return null;

    if (match.player1 === player) {
      match.player1Tactic = tactic;
    } else if (match.player2 === player) {
      match.player2Tactic = tactic;
    }

    if (match.player1Tactic !== null && match.player2Tactic !== null) {
      match.status = 'complete';
    }

    this.saveMatches(matches);
    return match;
  }

  // Poll for match updates
  watchMatch(matchId: string, callback: (match: Match | null) => void) {
    const interval = setInterval(() => {
      const match = this.getMatch(matchId);
      callback(match);
      if (match?.status === 'complete') {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }
}

export const matchmakingService = new MatchmakingService();
