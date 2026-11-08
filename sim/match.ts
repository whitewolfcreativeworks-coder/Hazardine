/**
 * Match runner and metrics for the simulation lab.
 */
import { createGame, applyAction, isOver, type RuleConfig, type Player } from '../src/engine';
import { makeAgent, type AgentSpec } from '../src/ai/agents';

export interface MatchResult {
  seed: number;
  /** Agent spec playing as Player A (moves first). */
  first: AgentSpec;
  second: AgentSpec;
  /** 0 = first player won, 1 = second player won, null = draw. */
  winner: Player | null;
  winnerSpec: AgentSpec | null;
  reason: string;
  turns: number;
  captures: number;
  rescues: number;
  rewards: number;
  combats: number;
  upsets: number;
  cardDecided: number;
  attackerWins: number;
  skipped: number;
  barricades: number;
  actions: number;
  /** Lowest material lead the eventual winner had during the game. */
  winnerMinLead: number | null;
  questRooms: number;
  trials: number;
  trialFails: number;
  shieldsUsed: number;
  musters: number;
  takeovers: number;
}

export function playMatch(rules: Partial<RuleConfig>, first: AgentSpec, second: AgentSpec, seed: number): MatchResult {
  const s = createGame(seed, rules);
  const agents = [makeAgent(first, seed * 2 + 1), makeAgent(second, seed * 2 + 2)];
  let guard = 0;
  while (!isOver(s) && guard++ < 20000) applyAction(s, agents[s.toMove].choose(s));
  const st = s.stats;
  return {
    seed,
    first,
    second,
    winner: s.winner,
    winnerSpec: s.winner === null ? null : s.winner === 0 ? first : second,
    reason: s.winReason,
    turns: s.turn,
    captures: st.captures[0] + st.captures[1],
    rescues: st.rescues[0] + st.rescues[1],
    rewards: st.promotions[0] + st.promotions[1] + st.reinforcements[0] + st.reinforcements[1],
    combats: st.combats,
    upsets: st.upsets,
    cardDecided: st.cardDecided,
    attackerWins: st.attackerWins,
    skipped: st.skippedTurns[0] + st.skippedTurns[1],
    barricades: st.barricadesPlaced[0] + st.barricadesPlaced[1],
    actions: st.actions[0] + st.actions[1],
    winnerMinLead: s.winner === null ? null : st.minLead[s.winner],
    questRooms: st.questRooms[0] + st.questRooms[1],
    trials: st.trials,
    trialFails: st.trialFails,
    shieldsUsed: st.shieldsUsed,
    musters: st.musters[0] + st.musters[1],
    takeovers: st.takeovers[0] + st.takeovers[1],
  };
}

export interface Summary {
  games: number;
  firstPlayerWinRate: number;
  drawRate: number;
  avgTurns: number;
  medianTurns: number;
  capturesPerGame: number;
  rescuesPerGame: number;
  rewardsPerGame: number;
  combatsPerGame: number;
  upsetRate: number;
  /** Share of combats where the card draw flipped the result the base strengths predicted. */
  cardDecidedRate: number;
  attackerWinRate: number;
  /** Share of decisive games won by a player who had trailed by 6+ material. */
  comebackRate: number;
  skippedTurnRate: number;
  barricadesPerGame: number;
  throneWinShare: number;
  questWinShare: number;
  questRoomsPerGame: number;
  trialsPerGame: number;
  trialFailRate: number;
  mustersPerGame: number;
  takeoversPerGame: number;
  winsBySpec: Record<string, number>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(rs: MatchResult[]): Summary {
  const decisive = rs.filter((r) => r.winner !== null);
  const turns = rs.map((r) => r.turns).sort((a, b) => a - b);
  const combats = rs.reduce((a, r) => a + r.combats, 0) || 1;
  const winsBySpec: Record<string, number> = {};
  for (const r of decisive) winsBySpec[r.winnerSpec!] = (winsBySpec[r.winnerSpec!] ?? 0) + 1;
  return {
    games: rs.length,
    firstPlayerWinRate: decisive.length ? decisive.filter((r) => r.winner === 0).length / decisive.length : 0.5,
    drawRate: (rs.length - decisive.length) / rs.length,
    avgTurns: mean(turns),
    medianTurns: turns[Math.floor(turns.length / 2)],
    capturesPerGame: mean(rs.map((r) => r.captures)),
    rescuesPerGame: mean(rs.map((r) => r.rescues)),
    rewardsPerGame: mean(rs.map((r) => r.rewards)),
    combatsPerGame: mean(rs.map((r) => r.combats)),
    upsetRate: rs.reduce((a, r) => a + r.upsets, 0) / combats,
    cardDecidedRate: rs.reduce((a, r) => a + r.cardDecided, 0) / combats,
    attackerWinRate: rs.reduce((a, r) => a + r.attackerWins, 0) / combats,
    comebackRate: decisive.length ? decisive.filter((r) => (r.winnerMinLead ?? 0) <= -6).length / decisive.length : 0,
    skippedTurnRate: rs.reduce((a, r) => a + r.skipped, 0) / Math.max(1, rs.reduce((a, r) => a + r.turns, 0)),
    barricadesPerGame: mean(rs.map((r) => r.barricades)),
    throneWinShare: decisive.length ? decisive.filter((r) => r.reason === 'throne taken').length / decisive.length : 0,
    questWinShare: decisive.length ? decisive.filter((r) => r.reason === 'quest complete').length / decisive.length : 0,
    questRoomsPerGame: mean(rs.map((r) => r.questRooms)),
    trialsPerGame: mean(rs.map((r) => r.trials)),
    mustersPerGame: mean(rs.map((r) => r.musters)),
    takeoversPerGame: mean(rs.map((r) => r.takeovers)),
    trialFailRate: rs.reduce((a, r) => a + r.trialFails, 0) / Math.max(1, rs.reduce((a, r) => a + r.trials, 0)),
    winsBySpec,
  };
}

/**
 * Game-health score, 0-100. A balancing instrument, not a measure of fun.
 * Each component is 0..1; weights reflect the spec's priorities
 * (balance, skill over luck, decisive games, reasonable length, possible comebacks).
 */
export interface Health {
  score: number;
  parts: Record<string, number>;
}

const band = (x: number, lo: number, hi: number, slack: number) =>
  x >= lo && x <= hi ? 1 : Math.max(0, 1 - (x < lo ? lo - x : x - hi) / slack);

export function health(selfPlay: Summary, skillEdge: number): Health {
  const parts = {
    balance: Math.max(0, 1 - Math.abs(selfPlay.firstPlayerWinRate - 0.5) * 4),
    decisive: Math.max(0, 1 - selfPlay.drawRate * 3),
    length: band(selfPlay.avgTurns, 40, 110, 60),
    skill: band(skillEdge, 0.75, 1, 0.3),
    comebacks: band(selfPlay.comebackRate, 0.12, 0.4, 0.15),
    luck: band(selfPlay.cardDecidedRate, 0.1, 0.35, 0.2),
    action: band(selfPlay.capturesPerGame, 4, 30, 6),
    agency: Math.max(0, 1 - selfPlay.skippedTurnRate * 5),
  };
  const weights = { balance: 3, decisive: 2, length: 1.5, skill: 3, comebacks: 1.5, luck: 1.5, action: 1, agency: 1 };
  let total = 0;
  let wsum = 0;
  for (const [k, v] of Object.entries(parts)) {
    total += v * weights[k as keyof typeof weights];
    wsum += weights[k as keyof typeof weights];
  }
  return { score: Math.round((total / wsum) * 1000) / 10, parts };
}
