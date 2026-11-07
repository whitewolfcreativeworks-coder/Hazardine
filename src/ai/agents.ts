/**
 * Computer opponents for Hazardine.
 *
 * - RandomAgent: picks any legal action. A floor for measuring how much skill matters.
 * - HeuristicAgent: one-action lookahead with a weighted evaluation. Weight sets give it a
 *   "personality" (aggressive, defensive, rusher, ...) so the lab can test whether any single
 *   strategy dominates.
 * - SearchAgent: Monte Carlo lookahead. Samples each promising action several times, plays the
 *   rest of the turn and the opponent's reply with the heuristic policy, and keeps the best
 *   average. Slower, stronger; used to measure the skill ceiling.
 *
 * Agents never peek at hidden information: rollouts reseed the RNG, so future dice and cards are
 * guessed, not read.
 */
import {
  type GameState,
  type Action,
  type Player,
  type Kind,
  legalActions,
  applyAction,
  cloneState,
  combatBase,
  attackWinProbability,
  cardValue,
  rowOf,
  colOf,
  territoryOf,
  throneOf,
  isOver,
  SQUARES,
  KINDS,
  decode,
  randInt,
  nextRandom,
} from '../engine';

export interface Agent {
  name: string;
  choose(s: GameState): Action;
}

// ---------- evaluation ----------

export interface Weights {
  material: number;
  /** Fraction of value an imprisoned piece keeps (low = eager to rescue). */
  jailed: number;
  ready: number;
  advance: number;
  pawnAdvance: number;
  middle: number;
  kingSafety: number;
  kingGuard: number;
  thronePressure: number;
  barricade: number;
  /** Multiplier on the downside of a risky attack (>1 = more cautious). */
  riskAversion: number;
}

export const PERSONALITIES: Record<string, Weights> = {
  balanced: { material: 1, jailed: 0.4, ready: 0.8, advance: 0.08, pawnAdvance: 0.15, middle: 0.3, kingSafety: 1.2, kingGuard: 0.4, thronePressure: 0.6, barricade: 0.3, riskAversion: 1 },
  aggressive: { material: 1.3, jailed: 0.3, ready: 0.6, advance: 0.15, pawnAdvance: 0.1, middle: 0.3, kingSafety: 0.6, kingGuard: 0.2, thronePressure: 0.8, barricade: 0.1, riskAversion: 0.6 },
  defensive: { material: 1, jailed: 0.5, ready: 0.8, advance: 0.03, pawnAdvance: 0.08, middle: 0.2, kingSafety: 2.2, kingGuard: 0.9, thronePressure: 0.3, barricade: 0.8, riskAversion: 1.6 },
  rusher: { material: 0.8, jailed: 0.2, ready: 0.5, advance: 0.25, pawnAdvance: 0.15, middle: 0.2, kingSafety: 0.8, kingGuard: 0.2, thronePressure: 1.6, barricade: 0.05, riskAversion: 0.8 },
  promoter: { material: 1, jailed: 0.3, ready: 1.2, advance: 0.05, pawnAdvance: 0.45, middle: 0.2, kingSafety: 1, kingGuard: 0.3, thronePressure: 0.4, barricade: 0.2, riskAversion: 1 },
  rescuer: { material: 1, jailed: 0.1, ready: 0.8, advance: 0.06, pawnAdvance: 0.12, middle: 0.3, kingSafety: 1.2, kingGuard: 0.4, thronePressure: 0.5, barricade: 0.3, riskAversion: 1.1 },
  territorial: { material: 1, jailed: 0.4, ready: 0.7, advance: 0.06, pawnAdvance: 0.12, middle: 1, kingSafety: 1.1, kingGuard: 0.4, thronePressure: 0.4, barricade: 0.5, riskAversion: 1 },
  conservative: { material: 1.1, jailed: 0.6, ready: 0.9, advance: 0.04, pawnAdvance: 0.1, middle: 0.25, kingSafety: 1.6, kingGuard: 0.6, thronePressure: 0.4, barricade: 0.5, riskAversion: 2 },
};

const WIN = 100000;

function dist(a: number, b: number) {
  return Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
}

/** Static evaluation from player p's point of view (higher is better for p). */
export function evaluate(s: GameState, p: Player, w: Weights): number {
  if (s.winner !== null) return s.winner === p ? WIN - s.turn : -WIN + s.turn;
  if (s.draw) return 0;
  const str = s.rules.strength;
  let score = 0;
  const kings: number[] = [-1, -1];
  const board = s.board;
  for (let i = 0; i < SQUARES; i++) {
    const c = board[i];
    if (!c) continue;
    const v = c - 1;
    const owner = (v >> 3) & 1;
    const kind = KINDS[v & 7];
    if (kind === 'K') {
      kings[owner] = i;
      continue;
    }
  }
  const throne = [throneOf(0), throneOf(1)];
  for (let i = 0; i < SQUARES; i++) {
    const c = board[i];
    if (!c) continue;
    const v = c - 1;
    const owner = ((v >> 3) & 1) as Player;
    const kind = KINDS[v & 7];
    const sign = owner === p ? 1 : -1;
    const r = rowOf(i);
    const prog = owner === 0 ? r : 23 - r; // 0..23 rows advanced
    let t = 0;
    if (kind !== 'K') {
      t += w.material * str[kind];
      t += (kind === 'P' ? w.pawnAdvance : w.advance) * prog;
      if (territoryOf(i) === 1) t += w.middle;
      const enemy = (1 - owner) as Player;
      const dThrone = dist(i, throne[enemy]);
      if (dThrone <= 6) t += w.thronePressure * (7 - dThrone) * 0.5;
      const ek = kings[enemy];
      if (ek >= 0) {
        const dk = dist(i, ek);
        if (dk <= 4) t += w.kingSafety * (5 - dk) * 0.6; // pressure on enemy king
      }
      const ok = kings[owner];
      if (ok >= 0 && dist(i, ok) <= 2) t += w.kingGuard;
    }
    score += sign * t;
  }
  for (const q of [0, 1] as Player[]) {
    const sign = q === p ? 1 : -1;
    let t = 0;
    for (const k of s.ready[q]) t += w.ready * str[k];
    // Barricades near own king.
    if (kings[q] >= 0) {
      for (let i = 0; i < SQUARES; i++) if (s.barricade[i] === q && dist(i, kings[q]) <= 2) t += w.barricade * 2;
    }
    t += w.barricade * 0.3 * s.barricadeStock[q];
    score += sign * t;
  }
  // Jail: an imprisoned piece keeps part of its value (it might come back).
  for (const q of [0, 1] as Player[]) {
    const sign = q === p ? 1 : -1;
    for (const k of s.jail[q]) score += sign * w.material * str[k] * w.jailed;
  }
  return score;
}

// ---------- action scoring ----------

/** Expected evaluation of taking action a now (one-action lookahead, combat by probability). */
export function scoreAction(s: GameState, a: Action, w: Weights): number {
  const p = s.toMove;
  if (a.t === 'end') return evaluate(s, p, w) - 0.05; // tiny bias to use dice
  if (a.t === 'move' && s.board[a.to] && s.rules.combat === 'cards') {
    const att = decode(s.board[a.from])!;
    const def = decode(s.board[a.to])!;
    const ab = combatBase(s, a.from, p, att.kind, false);
    const db = combatBase(s, a.to, def.owner, def.kind, true);
    const handCard = a.card !== undefined ? s.hands[p][a.card] : undefined;
    const prob = attackWinProbability(s.rules, ab, db, handCard !== undefined ? cardValue(handCard, s.rules) : undefined);
    // Win branch: capture without combat.
    const win = cloneState(s);
    forceMove(win, a, true);
    // Loss branch.
    const lose = cloneState(s);
    forceMove(lose, a, false);
    const ev = evaluate(win, p, w) * prob + evaluate(lose, p, w) * (1 - prob) * (prob < 1 ? 1 : 0);
    const base = evaluate(s, p, w);
    // Risk aversion amplifies the expected downside.
    const down = Math.min(0, evaluate(lose, p, w) - base) * (1 - prob) * (w.riskAversion - 1);
    // Saving good cards: small penalty for spending a high card.
    const cardCost = handCard !== undefined ? cardValue(handCard, s.rules) * 0.15 : 0;
    return ev + down - cardCost;
  }
  const c = cloneState(s);
  applyAction(c, a);
  return evaluate(c, p, w);
}

/** Apply a move with a forced combat outcome (for evaluation only). */
function forceMove(s: GameState, a: Extract<Action, { t: 'move' }>, attackerWins: boolean) {
  const p = s.toMove;
  const code = s.board[a.from];
  const def = s.board[a.to];
  if (attackerWins) {
    const dk = decode(def)!;
    if (dk.kind === 'K') {
      s.winner = p;
      return;
    }
    if (s.rules.captureMode === 'jail') s.jail[dk.owner].push(dk.kind);
    s.board[a.to] = code;
    s.board[a.from] = 0;
    if (a.reward && a.rewardType === 'reinforce') s.ready[p].push(a.reward);
    if (a.to === throneOf((1 - p) as Player) && s.rules.victory === 'kingOrThrone') s.winner = p;
  } else if (s.rules.attackerLoss === 'captured') {
    const ak = decode(code)!;
    s.board[a.from] = 0;
    if (ak.kind === 'K') s.winner = (1 - p) as Player;
    else if (s.rules.captureMode === 'jail') s.jail[p].push(ak.kind);
  }
}

// ---------- agents ----------

export class RandomAgent implements Agent {
  name = 'random';
  private r: { rng: number };
  constructor(seed = 1) {
    this.r = { rng: seed };
  }
  choose(s: GameState): Action {
    const acts = legalActions(s);
    // Avoid ending the turn early too often so random play still makes progress.
    const nonEnd = acts.filter((a) => a.t !== 'end');
    if (nonEnd.length && nextRandom(this.r) < 0.9) return nonEnd[randInt(this.r, nonEnd.length)];
    return acts[randInt(this.r, acts.length)];
  }
}

export class HeuristicAgent implements Agent {
  name: string;
  private r: { rng: number };
  constructor(
    public personality: keyof typeof PERSONALITIES | string = 'balanced',
    seed = 1,
    public noise = 0.3,
  ) {
    this.name = `heuristic:${personality}`;
    this.r = { rng: seed };
  }
  get weights(): Weights {
    return PERSONALITIES[this.personality] ?? PERSONALITIES.balanced;
  }
  choose(s: GameState): Action {
    const acts = legalActions(s);
    if (acts.length === 1) return acts[0];
    const w = this.weights;
    let best = acts[0];
    let bestScore = -Infinity;
    for (const a of acts) {
      const sc = scoreAction(s, a, w) + nextRandom(this.r) * this.noise;
      if (sc > bestScore) {
        bestScore = sc;
        best = a;
      }
    }
    return best;
  }
  /** Top-k actions by heuristic score (used by the search agent). */
  rank(s: GameState, k: number): Action[] {
    const w = this.weights;
    return legalActions(s)
      .map((a) => ({ a, sc: scoreAction(s, a, w) }))
      .sort((x, y) => y.sc - x.sc)
      .slice(0, k)
      .map((x) => x.a);
  }
}

export class SearchAgent implements Agent {
  name: string;
  private r: { rng: number };
  private policy: HeuristicAgent;
  constructor(
    public personality = 'balanced',
    seed = 1,
    public candidates = 6,
    public samples = 6,
  ) {
    this.name = `search:${personality}`;
    this.r = { rng: seed };
    this.policy = new HeuristicAgent(personality, seed + 101, 0.2);
  }
  choose(s: GameState): Action {
    const acts = legalActions(s);
    if (acts.length === 1) return acts[0];
    const p = s.toMove;
    const cands = this.policy.rank(s, this.candidates);
    if (!cands.some((a) => a.t === 'end')) cands.push({ t: 'end' });
    let best = cands[0];
    let bestScore = -Infinity;
    for (const a of cands) {
      let total = 0;
      for (let i = 0; i < this.samples; i++) {
        const c = cloneState(s);
        c.logEnabled = false;
        c.rng = (nextRandom(this.r) * 4294967296) >>> 0 || 1; // no peeking at future dice/cards
        applyAction(c, a);
        // Finish our turn, then play the opponent's whole reply.
        let switches = c.toMove === p ? 0 : 1;
        let guard = 0;
        while (!isOver(c) && switches < 2 && guard++ < 40) {
          const before = c.toMove;
          applyAction(c, this.policy.choose(c));
          if (c.toMove !== before) switches++;
        }
        total += evaluate(c, p, this.policy.weights);
      }
      const avg = total / this.samples;
      if (avg > bestScore) {
        bestScore = avg;
        best = a;
      }
    }
    return best;
  }
}

export type AgentSpec = string; // 'random' | 'heuristic:<personality>' | 'search:<personality>'

export function makeAgent(spec: AgentSpec, seed: number): Agent {
  const [type, pers = 'balanced'] = spec.split(':');
  if (type === 'random') return new RandomAgent(seed);
  if (type === 'search') return new SearchAgent(pers, seed);
  return new HeuristicAgent(pers, seed);
}

export type { Kind };
