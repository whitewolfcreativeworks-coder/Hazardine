/**
 * Hazardine rules engine.
 *
 * Pure game logic, no DOM. The same engine drives the browser UI and the
 * simulation lab. All randomness flows through a seeded RNG stored in the
 * state, so any game can be replayed exactly from its seed and action list.
 *
 * Board: 8 columns x 24 rows. Rows 0-7 are Player A's homeland (chessboard),
 * rows 8-15 the contested middle (checkerboard), rows 16-23 Player B's
 * homeland (chessboard). Player A advances toward higher rows, B toward lower.
 */
import { type Kind, type RuleConfig, makeRules } from './config';
import { rollDie, shuffle, nextRandom } from './rng';

export type Player = 0 | 1;
export const COLS = 8;
export const ROWS = 24;
export const SQUARES = COLS * ROWS;
export const KINDS: Kind[] = ['K', 'Q', 'R', 'B', 'N', 'P'];
export const REWARD_KINDS: Kind[] = ['Q', 'R', 'B', 'N'];

// ---------- squares & territories ----------

export const sq = (row: number, col: number) => row * COLS + col;
export const rowOf = (s: number) => Math.floor(s / COLS);
export const colOf = (s: number) => s % COLS;
export const onBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** 0 = Player A homeland, 1 = contested middle, 2 = Player B homeland. */
export function territoryOf(s: number): 0 | 1 | 2 {
  const r = rowOf(s);
  return r < 8 ? 0 : r < 16 ? 1 : 2;
}
export const homeTerritory = (p: Player): 0 | 2 => (p === 0 ? 0 : 2);
export const enemyTerritory = (p: Player): 0 | 2 => (p === 0 ? 2 : 0);
export const forward = (p: Player) => (p === 0 ? 1 : -1);
/** Back rank row for a player (row 0 for A, row 23 for B). */
export const backRow = (p: Player) => (p === 0 ? 0 : ROWS - 1);

// ---------- piece encoding (compact, fast to clone) ----------
// code = 1 + kindIdx + owner*8 + (veteran ? 32 : 0); 0 = empty

export interface PieceInfo {
  owner: Player;
  kind: Kind;
  /** A pawn that has already earned its advancement reward. */
  veteran: boolean;
}

export function encode(owner: Player, kind: Kind, veteran = false): number {
  return 1 + KINDS.indexOf(kind) + owner * 8 + (veteran ? 32 : 0);
}
export function decode(code: number): PieceInfo | null {
  if (!code) return null;
  const v = code - 1;
  return { owner: ((v >> 3) & 1) as Player, kind: KINDS[v & 7], veteran: ((v >> 5) & 1) === 1 };
}
const ownerOf = (code: number) => (((code - 1) >> 3) & 1) as Player;
const kindOf = (code: number) => KINDS[(code - 1) & 7];
const isVet = (code: number) => (((code - 1) >> 5) & 1) === 1;

// ---------- cards ----------
// card 0..51; rank = card % 13 (0 = 2 ... 12 = Ace); suit = floor(card / 13): ♠ ♥ ♦ ♣

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const cardLabel = (c: number) => RANKS[c % 13] + SUITS[Math.floor(c / 13)];
export const isRed = (c: number) => {
  const s = Math.floor(c / 13);
  return s === 1 || s === 2;
};

export function cardValue(card: number, rules: RuleConfig): number {
  const rank = card % 13; // 0..12
  if (rules.cardScale === 'full') return rank + 2; // 2..14
  // tiered: 2-4 →1, 5-7 →2, 8-10 →3, J-Q →4, K-A →5
  if (rank <= 2) return 1;
  if (rank <= 5) return 2;
  if (rank <= 8) return 3;
  if (rank <= 10) return 4;
  return 5;
}

// ---------- state ----------

export interface Stats {
  captures: [number, number];
  rescues: [number, number];
  promotions: [number, number];
  reinforcements: [number, number];
  barricadesPlaced: [number, number];
  combats: number;
  attackerWins: number;
  /** Combats won by the side whose strength before cards was lower. */
  upsets: number;
  /** Combats where the card swing decided the result (would have gone the other way with no cards). */
  cardDecided: number;
  skippedTurns: [number, number];
  /** Quest rooms cleared, trials attempted and failed, shields that saved a piece. */
  questRooms: [number, number];
  trials: number;
  trialFails: number;
  shieldsUsed: number;
  actions: [number, number];
  /** Lowest material lead each player held at any turn start (negative = trailed). */
  minLead: [number, number];
}

export interface GameState {
  rules: RuleConfig;
  board: Int8Array;
  /** -1 none, 0/1 barricade owner. */
  barricade: Int8Array;
  toMove: Player;
  /** Dice still available this turn. */
  dice: number[];
  /** Dice rolled at the start of this turn (for display). */
  rolled: number[];
  /** Player-turns completed. */
  turn: number;
  /** jail[p] = p's pieces held prisoner by the opponent. */
  jail: [Kind[], Kind[]];
  /** Reinforcements earned and waiting to be deployed at home. */
  ready: [Kind[], Kind[]];
  /** Unused pieces in each player's supply (from the four chess sets). */
  reserve: [Record<Kind, number>, Record<Kind, number>];
  barricadeStock: [number, number];
  deck: number[];
  discard: number[];
  hands: [number[], number[]];
  rng: number;
  winner: Player | null;
  draw: boolean;
  winReason: string;
  stats: Stats;
  /** Most recent combat, for the UI. */
  lastCombat: CombatResult | null;
  /** Quest progress: rooms cleared (0..3) per player. */
  questStage: [number, number];
  /** Shields earned from the quest: each turns one lost defence into a repelled attack. */
  shields: [number, number];
  /** Bonus on the next trial, from the other side's progress (linked quests). */
  questEase: [number, number];
  /** Most recent quest trial, for the UI. */
  lastTrial: TrialResult | null;
  log: string[];
  logEnabled: boolean;
}

export type Action =
  | { t: 'move'; from: number; to: number; dice: number[]; card?: number; reward?: Kind; rewardType?: 'promote' | 'reinforce' }
  | { t: 'demolish'; from: number; to: number; dice: number[] }
  | { t: 'barricade'; to: number; dice: number[] }
  | { t: 'rescue'; kind: Kind; to: number; dice: number[] }
  | { t: 'deploy'; kind: Kind; to: number; dice: number[] }
  | { t: 'end' };

export interface CombatResult {
  attacker: Player;
  attackerKind: Kind;
  defenderKind: Kind;
  from: number;
  to: number;
  attackBase: number;
  defenseBase: number;
  attackCard: number;
  defenseCard: number;
  attackTotal: number;
  defenseTotal: number;
  attackerWon: boolean;
  shielded?: boolean;
  /** Extra attacker card from a battle-zone charge. */
  chargeCard?: number;
}

export interface TrialResult {
  player: Player;
  kind: Kind;
  square: number;
  room: number;
  strength: number;
  card: number;
  total: number;
  target: number;
  passed: boolean;
  boon: string;
}

// ---------- quest rooms ----------
// Each side has three rooms. Ivory's: the Ford (near half of the middle), the Crypt (far half of
// the middle), the Vault (inside Ebony's homeland). Ebony's are the mirror image. The two dungeons
// interleave in the middle, so the quests collide.

export const QUEST_ROOM_NAMES = ['The Ford', 'The Crypt', 'The Vault'];
const IVORY_ROOMS: [number, number][][] = [
  [
    [10, 1],
    [10, 6],
  ],
  [
    [13, 2],
    [13, 5],
  ],
  [
    [19, 0],
    [19, 7],
  ],
];
export function questRooms(p: Player, stage: number): number[] {
  const rooms = IVORY_ROOMS[stage];
  if (!rooms) return [];
  return rooms.map(([r, c]) => (p === 0 ? sq(r, c) : sq(ROWS - 1 - r, COLS - 1 - c)));
}

// ---------- setup ----------

const FULL_BACK: Kind[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const REDUCED_BACK: (Kind | null)[] = [null, 'N', 'B', null, 'K', null, 'R', null];
const REDUCED_PAWN_COLS = [1, 2, 3, 4, 5, 6];

/** Each player's supply: two full chess sets (the spec's four sets, split between two players). */
function fullSupply(): Record<Kind, number> {
  return { K: 2, Q: 2, R: 4, B: 4, N: 4, P: 16 };
}

export function createGame(seed: number, rulesIn?: Partial<RuleConfig> | RuleConfig, opts: { log?: boolean } = {}): GameState {
  const rules = makeRules(rulesIn);
  const s: GameState = {
    rules,
    board: new Int8Array(SQUARES),
    barricade: new Int8Array(SQUARES).fill(-1),
    toMove: 0,
    dice: [],
    rolled: [],
    turn: 0,
    jail: [[], []],
    ready: [[], []],
    reserve: [fullSupply(), fullSupply()],
    barricadeStock: [rules.barricades, rules.barricades],
    deck: [],
    discard: [],
    hands: [[], []],
    rng: seed >>> 0 || 1,
    winner: null,
    draw: false,
    winReason: '',
    stats: {
      captures: [0, 0],
      rescues: [0, 0],
      promotions: [0, 0],
      reinforcements: [0, 0],
      barricadesPlaced: [0, 0],
      combats: 0,
      attackerWins: 0,
      upsets: 0,
      cardDecided: 0,
      skippedTurns: [0, 0],
      actions: [0, 0],
      minLead: [0, 0],
      questRooms: [0, 0],
      trials: 0,
      trialFails: 0,
      shieldsUsed: 0,
    },
    lastCombat: null,
    questStage: [0, 0],
    shields: [0, 0],
    questEase: [0, 0],
    lastTrial: null,
    log: [],
    logEnabled: !!opts.log,
  };

  for (const p of [0, 1] as Player[]) {
    const back = backRow(p);
    const pawnRow = back + forward(p) * (rules.startingArmy === 'forward' ? 3 : 1);
    const place = (r: number, c: number, k: Kind) => {
      s.board[sq(r, c)] = encode(p, k);
      s.reserve[p][k]--;
    };
    if (rules.startingArmy === 'reduced') {
      REDUCED_BACK.forEach((k, c) => k && place(back, c, k));
      REDUCED_PAWN_COLS.forEach((c) => place(pawnRow, c, 'P'));
    } else {
      FULL_BACK.forEach((k, c) => place(back, c, k));
      for (let c = 0; c < COLS; c++) place(pawnRow, c, 'P');
    }
  }

  s.deck = shuffle(s, Array.from({ length: 52 }, (_, i) => i));
  if (rules.combat === 'cards' && rules.handSize > 0) {
    for (const p of [0, 1] as Player[]) for (let i = 0; i < rules.handSize; i++) s.hands[p].push(drawCard(s));
  }
  startTurn(s);
  return s;
}

/** King's starting square for a player (the "throne"). */
export function throneOf(p: Player): number {
  return sq(backRow(p), 4);
}

// ---------- cloning ----------

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    board: s.board.slice(),
    barricade: s.barricade.slice(),
    dice: s.dice.slice(),
    rolled: s.rolled.slice(),
    jail: [s.jail[0].slice(), s.jail[1].slice()],
    ready: [s.ready[0].slice(), s.ready[1].slice()],
    reserve: [{ ...s.reserve[0] }, { ...s.reserve[1] }],
    barricadeStock: [s.barricadeStock[0], s.barricadeStock[1]],
    deck: s.deck.slice(),
    discard: s.discard.slice(),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    stats: {
      ...s.stats,
      captures: [...s.stats.captures],
      rescues: [...s.stats.rescues],
      promotions: [...s.stats.promotions],
      reinforcements: [...s.stats.reinforcements],
      barricadesPlaced: [...s.stats.barricadesPlaced],
      skippedTurns: [...s.stats.skippedTurns],
      actions: [...s.stats.actions],
      minLead: [...s.stats.minLead],
      questRooms: [...s.stats.questRooms],
    },
    questStage: [s.questStage[0], s.questStage[1]],
    shields: [s.shields[0], s.shields[1]],
    questEase: [s.questEase[0], s.questEase[1]],
    log: s.logEnabled ? s.log.slice() : s.log,
  };
}

// ---------- helpers ----------

export function pieceAt(s: GameState, square: number): PieceInfo | null {
  return decode(s.board[square]);
}

export function material(s: GameState, p: Player): number {
  let m = 0;
  for (let i = 0; i < SQUARES; i++) {
    const c = s.board[i];
    if (c && ownerOf(c) === p) {
      const k = kindOf(c);
      if (k !== 'K') m += s.rules.strength[k];
    }
  }
  return m;
}

function log(s: GameState, msg: string) {
  if (s.logEnabled) s.log.push(msg);
}

export function squareName(square: number): string {
  return 'abcdefgh'[colOf(square)] + (rowOf(square) + 1);
}

function drawCard(s: GameState): number {
  if (s.deck.length === 0) {
    s.deck = shuffle(s, s.discard);
    s.discard = [];
  }
  return s.deck.pop()!;
}

function startTurn(s: GameState) {
  const a = rollDie(s);
  const b = rollDie(s);
  let dice = [a, b];
  if (a === b) {
    if (s.rules.doubles === 'three') dice = [a, a, a];
    else if (s.rules.doubles === 'four') dice = [a, a, a, a];
  }
  if (s.turn === 0 && s.rules.firstTurnOneDie) dice = [a];
  s.dice = dice;
  s.rolled = dice.slice();
  const lead = material(s, s.toMove) - material(s, (1 - s.toMove) as Player);
  if (lead < s.stats.minLead[s.toMove]) s.stats.minLead[s.toMove] = lead;
  if (-lead < s.stats.minLead[1 - s.toMove]) s.stats.minLead[1 - s.toMove] = -lead;
}

function endTurn(s: GameState) {
  s.turn++;
  if (s.turn >= s.rules.maxTurns && s.winner === null) {
    s.draw = true;
    s.winReason = 'turn limit reached';
    s.dice = [];
    return;
  }
  s.toMove = (1 - s.toMove) as Player;
  startTurn(s);
}

const DIRS_ROOK = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIRS_BISHOP = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const DIRS_ALL = [...DIRS_ROOK, ...DIRS_BISHOP];
const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

function rangeFor(s: GameState, v: number) {
  return s.rules.rangeMode === 'die' ? v : ROWS;
}
function pawnRange(s: GameState, v: number) {
  return s.rules.pawnMode === 'one' ? 1 : Math.ceil(v / 2);
}

/**
 * Destination squares for one piece using a movement allowance `v`.
 * Returns target squares; whether each is a move or an attack is decided by occupancy.
 */
export function pieceTargets(s: GameState, from: number, v: number): number[] {
  const code = s.board[from];
  if (!code) return [];
  const p = ownerOf(code);
  const k = kindOf(code);
  const r0 = rowOf(from);
  const c0 = colOf(from);
  const out: number[] = [];
  const tryLand = (r: number, c: number): 'stop' | 'go' => {
    if (!onBoard(r, c)) return 'stop';
    const t = sq(r, c);
    if (s.barricade[t] !== -1) return 'stop';
    const occ = s.board[t];
    if (!occ) {
      out.push(t);
      return 'go';
    }
    if (ownerOf(occ) !== p) out.push(t);
    return 'stop';
  };
  if (k === 'Q' || k === 'R' || k === 'B') {
    const dirs = k === 'Q' ? DIRS_ALL : k === 'R' ? DIRS_ROOK : DIRS_BISHOP;
    const max = rangeFor(s, v);
    for (const [dr, dc] of dirs) {
      for (let i = 1; i <= max; i++) if (tryLand(r0 + dr * i, c0 + dc * i) === 'stop') break;
    }
  } else if (k === 'K') {
    for (const [dr, dc] of DIRS_ALL) tryLand(r0 + dr, c0 + dc);
  } else if (k === 'N') {
    for (const [dr, dc] of KNIGHT) tryLand(r0 + dr, c0 + dc);
  } else {
    const f = forward(p);
    const max = pawnRange(s, v);
    for (let i = 1; i <= max; i++) {
      const r = r0 + f * i;
      if (!onBoard(r, c0)) break;
      const t = sq(r, c0);
      if (s.board[t] || s.barricade[t] !== -1) break;
      out.push(t);
    }
    for (const dc of [-1, 1]) {
      const r = r0 + f;
      const c = c0 + dc;
      if (!onBoard(r, c)) continue;
      const t = sq(r, c);
      const occ = s.board[t];
      if (occ && ownerOf(occ) !== p) out.push(t);
    }
  }
  return out;
}

function inPromotionZone(s: GameState, p: Player, square: number) {
  if (s.rules.promotionZone === 'backRank') return rowOf(square) === backRow((1 - p) as Player);
  return territoryOf(square) === enemyTerritory(p);
}

function homeSquares(s: GameState, p: Player): number[] {
  const out: number[] = [];
  const b = backRow(p);
  for (const r of [b, b + forward(p)]) {
    for (let c = 0; c < COLS; c++) {
      const t = sq(r, c);
      if (!s.board[t] && s.barricade[t] === -1) out.push(t);
    }
  }
  return out;
}

function adjacent(square: number): number[] {
  const r0 = rowOf(square);
  const c0 = colOf(square);
  const out: number[] = [];
  for (const [dr, dc] of DIRS_ALL) if (onBoard(r0 + dr, c0 + dc)) out.push(sq(r0 + dr, c0 + dc));
  return out;
}

/** Dice options as index lists: each single die (deduped by value) plus pairs if combining is allowed. */
function diceOptions(s: GameState): { idx: number[]; v: number }[] {
  const seen = new Set<number>();
  const out: { idx: number[]; v: number }[] = [];
  s.dice.forEach((v, i) => {
    if (!seen.has(v)) {
      seen.add(v);
      out.push({ idx: [i], v });
    }
  });
  return out;
}
function comboOptions(s: GameState): { idx: number[]; v: number }[] {
  if (!s.rules.combineDice || s.dice.length < 2) return [];
  const seen = new Set<number>();
  const out: { idx: number[]; v: number }[] = [];
  for (let i = 0; i < s.dice.length; i++)
    for (let j = i + 1; j < s.dice.length; j++) {
      const v = s.dice[i] + s.dice[j];
      const key = Math.min(s.dice[i], s.dice[j]) * 10 + Math.max(s.dice[i], s.dice[j]);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ idx: [i, j], v });
      }
    }
  return out;
}

/**
 * Battle-zone color: Ivory's color is red, Ebony's is black, matching their checkers.
 * In the middle board, red squares are those where row + col is odd.
 */
export function isOwnColor(square: number, owner: Player): boolean {
  if (territoryOf(square) !== 1) return false;
  const red = (rowOf(square) + colOf(square)) % 2 === 1;
  return owner === 0 ? red : !red;
}

/** Strength of a unit at a square before cards: base + support + terrain bonuses. */
export function combatBase(s: GameState, square: number, owner: Player, kind: Kind, defending: boolean): number {
  const r = s.rules;
  let v = r.strength[kind];
  let support = 0;
  let fort = false;
  for (const a of adjacent(square)) {
    const c = s.board[a];
    if (c && ownerOf(c) === owner) support++;
    if (s.barricade[a] === owner) fort = true;
  }
  v += Math.min(support, r.supportCap) * r.supportBonus;
  if (r.battleZone === 'colorGround' && isOwnColor(square, owner)) v += r.battleBonus;
  if (defending) {
    if (fort) v += r.fortBonus;
    if (territoryOf(square) === homeTerritory(owner)) v += r.homeDefense;
  }
  return v;
}

// ---------- legal actions ----------

export function legalActions(s: GameState): Action[] {
  if (s.winner !== null || s.draw) return [];
  const out: Action[] = [];
  const p = s.toMove;
  const r = s.rules;
  const singles = diceOptions(s);
  const combos = comboOptions(s);
  const hand = s.hands[p];

  for (let from = 0; from < SQUARES; from++) {
    const code = s.board[from];
    if (!code || ownerOf(code) !== p) continue;
    const k = kindOf(code);
    // Long-move combos only matter for sliders and die-ranged pawns.
    const useCombos = (k === 'Q' || k === 'R' || k === 'B') && r.rangeMode === 'die' ? combos : k === 'P' && r.pawnMode === 'half' ? combos : [];
    const targetsSeen = new Map<number, number[]>(); // target -> cheapest dice
    const consider = (opt: { idx: number[]; v: number }, costRank: number) => {
      for (const t of pieceTargets(s, from, opt.v)) {
        const prev = targetsSeen.get(t);
        // Prefer single dice, and the smallest die that reaches.
        if (!prev || costRank < prev[0] || (costRank === prev[0] && opt.v < prev[1])) targetsSeen.set(t, [costRank, opt.v, ...opt.idx]);
      }
    };
    // For K/N (die value irrelevant), expose one option per distinct die value so the player can choose which die to spend.
    if (k === 'K' || k === 'N' || (k === 'P' && r.pawnMode === 'one')) {
      for (const opt of singles) for (const t of pieceTargets(s, from, opt.v)) pushMoveVariants(s, out, from, t, opt.idx, code, hand);
    } else {
      // For ranged pieces, offer every die that reaches each target (spending a bigger die than needed is a real choice).
      for (const opt of singles) for (const t of pieceTargets(s, from, opt.v)) pushMoveVariants(s, out, from, t, opt.idx, code, hand);
      for (const opt of useCombos) consider(opt, 1);
      for (const [t, info] of targetsSeen) {
        // Only add combo moves that no single die can reach.
        const singleReach = singles.some((o) => pieceTargets(s, from, o.v).includes(t));
        if (!singleReach) pushMoveVariants(s, out, from, t, info.slice(2), code, hand);
      }
    }
    // Demolish an adjacent enemy barricade.
    if (r.barricades > 0) {
      for (const a of adjacent(from)) {
        if (s.barricade[a] === 1 - p) {
          const d = singles.filter((o) => o.v >= r.demolishMinDie).sort((x, y) => x.v - y.v)[0];
          if (d) out.push({ t: 'demolish', from, to: a, dice: d.idx });
        }
      }
    }
  }

  // Place a barricade: any empty square in your homeland or the middle, adjacent to one of your pieces.
  if (s.barricadeStock[p] > 0 && singles.length) {
    const d = singles.slice().sort((x, y) => x.v - y.v)[0];
    const placed = new Set<number>();
    for (let from = 0; from < SQUARES; from++) {
      const code = s.board[from];
      if (!code || ownerOf(code) !== p) continue;
      for (const a of adjacent(from)) {
        if (placed.has(a) || s.board[a] || s.barricade[a] !== -1) continue;
        if (territoryOf(a) === enemyTerritory(p)) continue;
        placed.add(a);
        out.push({ t: 'barricade', to: a, dice: d.idx });
      }
    }
  }

  // Rescue a prisoner.
  if (r.captureMode === 'jail' && r.rescueMinDie > 0 && s.jail[p].length) {
    const d = singles.filter((o) => o.v >= r.rescueMinDie).sort((x, y) => x.v - y.v)[0];
    if (d) {
      const kinds = [...new Set(s.jail[p])];
      const squares = homeSquares(s, p);
      for (const kind of kinds) for (const to of squares) out.push({ t: 'rescue', kind, to, dice: d.idx });
    }
  }

  // Deploy an earned reinforcement.
  if (s.ready[p].length && singles.length) {
    const d = singles.slice().sort((x, y) => x.v - y.v)[0];
    const kinds = [...new Set(s.ready[p])];
    const squares = homeSquares(s, p);
    for (const kind of kinds) for (const to of squares) out.push({ t: 'deploy', kind, to, dice: d.idx });
  }

  out.push({ t: 'end' });
  return out;
}

function pushMoveVariants(s: GameState, out: Action[], from: number, to: number, dice: number[], code: number, hand: number[]) {
  const p = ownerOf(code);
  const k = kindOf(code);
  const isAttack = !!s.board[to];
  const cardChoices = isAttack && s.rules.combat === 'cards' && s.rules.handSize > 0 && hand.length ? hand.map((_, i) => i) : [undefined];
  const triggers = k === 'P' && !isVet(code) && s.rules.promotionMode !== 'none' && inPromotionZone(s, p, to);
  const rewards: { reward?: Kind; rewardType?: 'promote' | 'reinforce' }[] = [];
  if (triggers) {
    const avail = REWARD_KINDS.filter((rk) => s.reserve[p][rk] > 0);
    const mode = s.rules.promotionMode;
    if (mode === 'promote' || mode === 'choice') for (const rk of avail) rewards.push({ reward: rk, rewardType: 'promote' });
    if (mode === 'reinforce' || mode === 'choice') for (const rk of avail) rewards.push({ reward: rk, rewardType: 'reinforce' });
  }
  if (!rewards.length) rewards.push({});
  for (const card of cardChoices) for (const rw of rewards) out.push({ t: 'move', from, to, dice, ...(card !== undefined ? { card } : {}), ...rw });
}

// ---------- applying actions ----------

function spendDice(s: GameState, idx: number[]) {
  const sorted = [...idx].sort((a, b) => b - a);
  for (const i of sorted) s.dice.splice(i, 1);
}

function capture(s: GameState, square: number, captor: Player) {
  const code = s.board[square];
  const victim = ownerOf(code);
  const k = kindOf(code);
  s.board[square] = 0;
  s.stats.captures[captor]++;
  if (k === 'K') {
    s.winner = captor;
    s.winReason = 'king captured';
    return;
  }
  if (s.rules.captureMode === 'jail') s.jail[victim].push(k);
  else s.reserve[victim][k]++;
}

function resolveCombat(s: GameState, a: Extract<Action, { t: 'move' }>): boolean {
  const p = s.toMove;
  const attCode = s.board[a.from];
  const defCode = s.board[a.to];
  const ak = kindOf(attCode);
  const dk = kindOf(defCode);
  const defender = ownerOf(defCode);
  const attackBase = combatBase(s, a.from, p, ak, false);
  const defenseBase = combatBase(s, a.to, defender, dk, true);
  let attackCard: number;
  if (s.rules.handSize > 0 && a.card !== undefined && s.hands[p].length) {
    attackCard = s.hands[p].splice(a.card, 1)[0];
    s.hands[p].push(drawCard(s));
  } else attackCard = drawCard(s);
  const defenseCard = drawCard(s);
  s.discard.push(attackCard, defenseCard);
  let chargeCard: number | undefined;
  if (s.rules.battleZone === 'charge' && territoryOf(a.to) === 1) {
    chargeCard = drawCard(s);
    s.discard.push(chargeCard);
  }
  const attackTotal = attackBase + cardValue(attackCard, s.rules) + (chargeCard !== undefined ? cardValue(chargeCard, s.rules) : 0);
  const defenseTotal = defenseBase + cardValue(defenseCard, s.rules);
  let won = attackTotal > defenseTotal;
  let shielded = false;
  if (won && s.shields[defender] > 0) {
    s.shields[defender]--;
    s.stats.shieldsUsed++;
    won = false;
    shielded = true;
  }
  s.stats.combats++;
  if (won) s.stats.attackerWins++;
  const baseFavorsAttacker = attackBase > defenseBase;
  if ((won && attackBase < defenseBase) || (!won && attackBase > defenseBase)) s.stats.upsets++;
  if (won !== baseFavorsAttacker) s.stats.cardDecided++;
  s.lastCombat = {
    attacker: p,
    attackerKind: ak,
    defenderKind: dk,
    from: a.from,
    to: a.to,
    attackBase,
    defenseBase,
    attackCard,
    defenseCard,
    attackTotal,
    defenseTotal,
    attackerWon: won,
    shielded,
    chargeCard,
  };
  log(
    s,
    `${ak}${squareName(a.from)} attacks ${dk}${squareName(a.to)}: ${attackBase}+${cardLabel(attackCard)}=${attackTotal} vs ${defenseBase}+${cardLabel(defenseCard)}=${defenseTotal} → ${shielded ? 'blocked by a shield' : won ? 'captured' : 'repelled'}`,
  );
  return won;
}

/** Apply an action in place. Assumes the action came from legalActions(s). */
export function applyAction(s: GameState, a: Action, opts: { forceTrial?: boolean } = {}): void {
  if (s.winner !== null || s.draw) return;
  const p = s.toMove;
  s.lastCombat = null;
  s.lastTrial = null;
  if (a.t === 'end') {
    if (s.dice.length === s.rolled.length) s.stats.skippedTurns[p] += legalActions(s).length === 1 ? 1 : 0;
    endTurn(s);
    return;
  }
  s.stats.actions[p]++;
  spendDice(s, a.dice);

  switch (a.t) {
    case 'move': {
      const code = s.board[a.from];
      let landed = true;
      if (s.board[a.to]) {
        const won = s.rules.combat === 'cards' ? resolveCombat(s, a) : true;
        if (won) capture(s, a.to, p);
        else {
          landed = false;
          if (s.rules.attackerLoss === 'captured') capture(s, a.from, (1 - p) as Player);
        }
        if (s.rules.combat === 'none') log(s, `${kindOf(code)}${squareName(a.from)} captures on ${squareName(a.to)}`);
      } else log(s, `${kindOf(code)}${squareName(a.from)}→${squareName(a.to)}`);
      if (s.winner !== null) {
        if (landed) {
          s.board[a.to] = code;
          s.board[a.from] = 0;
        }
        return;
      }
      if (landed) {
        let newCode = code;
        if (a.reward && a.rewardType === 'promote') {
          s.reserve[p][a.reward]--;
          s.reserve[p].P++;
          newCode = encode(p, a.reward);
          s.stats.promotions[p]++;
          log(s, `Pawn promoted to ${a.reward}`);
        } else if (a.reward && a.rewardType === 'reinforce') {
          s.reserve[p][a.reward]--;
          s.ready[p].push(a.reward);
          newCode = encode(p, 'P', true);
          s.stats.reinforcements[p]++;
          log(s, `Pawn earned a ${a.reward} reinforcement`);
        } else if (kindOf(code) === 'P' && !isVet(code) && s.rules.promotionMode !== 'none' && inPromotionZone(s, p, a.to)) {
          newCode = encode(p, 'P', true); // reached the zone with no reward available
        }
        s.board[a.to] = newCode;
        s.board[a.from] = 0;
        if (s.rules.victory === 'kingOrThrone' && a.to === throneOf((1 - p) as Player)) {
          s.winner = p;
          s.winReason = 'throne taken';
          return;
        }
        if (s.rules.quest !== 'off' && isQuestRoom(s, p, a.to) && kindOf(newCode) !== 'K') {
          runTrial(s, a.to, opts.forceTrial);
          if (s.winner !== null) return;
        }
      }
      break;
    }
    case 'demolish':
      s.barricade[a.to] = -1;
      s.barricadeStock[1 - p]++;
      log(s, `Barricade on ${squareName(a.to)} demolished`);
      break;
    case 'barricade':
      s.barricade[a.to] = p;
      s.barricadeStock[p]--;
      s.stats.barricadesPlaced[p]++;
      log(s, `Barricade placed on ${squareName(a.to)}`);
      break;
    case 'rescue': {
      const i = s.jail[p].indexOf(a.kind);
      s.jail[p].splice(i, 1);
      s.board[a.to] = encode(p, a.kind);
      s.stats.rescues[p]++;
      log(s, `${a.kind} rescued to ${squareName(a.to)}`);
      break;
    }
    case 'deploy': {
      const i = s.ready[p].indexOf(a.kind);
      s.ready[p].splice(i, 1);
      s.board[a.to] = encode(p, a.kind);
      log(s, `${a.kind} deployed on ${squareName(a.to)}`);
      break;
    }
  }
  if (s.dice.length === 0) endTurn(s);
}

/** True if `square` is one of player p's rooms for their current quest stage. */
export function isQuestRoom(s: GameState, p: Player, square: number): boolean {
  return s.questStage[p] < 3 && questRooms(p, s.questStage[p]).includes(square);
}

export function trialTarget(s: GameState, p: Player): number {
  const d = s.rules.questDifficulty[s.questStage[p]] ?? 99;
  return d - s.questEase[p];
}

/** A piece entering one of its own quest rooms faces a trial: strength + a blind card must reach the target. */
function runTrial(s: GameState, square: number, force?: boolean) {
  const p = s.toMove;
  const code = s.board[square];
  const kind = kindOf(code);
  const room = s.questStage[p];
  const target = trialTarget(s, p);
  const card = drawCard(s);
  s.discard.push(card);
  const strength = s.rules.strength[kind];
  const total = strength + cardValue(card, s.rules);
  const passed = force ?? total >= target;
  s.stats.trials++;
  let boon = '';
  if (passed) {
    s.questStage[p]++;
    s.questEase[p] = 0;
    s.stats.questRooms[p]++;
    if (s.rules.questLink) s.questEase[1 - p] += s.rules.questLink;
    if (room === 0) {
      const k = (['R', 'B', 'N'] as Kind[]).find((x) => s.reserve[p][x] > 0);
      if (k) {
        s.reserve[p][k]--;
        s.ready[p].push(k);
        boon = `a ${k} reinforcement`;
      }
    } else if (room === 1) {
      s.shields[p]++;
      boon = 'a shield';
    } else if (s.rules.quest === 'win') {
      s.winner = p;
      s.winReason = 'quest complete';
      boon = 'victory';
    } else {
      if (s.reserve[p].Q > 0) {
        s.reserve[p].Q--;
        s.ready[p].push('Q');
      }
      const freed = s.jail[p].shift();
      if (freed) s.ready[p].push(freed);
      boon = 'a queen and a freed prisoner';
    }
  } else {
    s.stats.trialFails++;
    s.board[square] = 0;
    if (s.rules.captureMode === 'jail') s.jail[p].push(kind);
    else s.reserve[p][kind]++;
  }
  s.lastTrial = { player: p, kind, square, room, strength, card, total, target, passed, boon };
  log(s, `${kind} enters ${QUEST_ROOM_NAMES[room]}: ${strength}+${cardLabel(card)}=${total} vs ${target} → ${passed ? `cleared, gains ${boon}` : 'falls, taken to jail'}`);
}

/** Probability a piece of the given strength passes a trial with the given target. */
export function trialPassProbability(rules: RuleConfig, strength: number, target: number): number {
  const dist = cardValueDistribution(rules);
  return dist.filter((v) => strength + v >= target).length / dist.length;
}

/** Convenience: true when the only legal action is ending the turn. */
export function mustPass(s: GameState): boolean {
  return legalActions(s).length === 1;
}

export function isOver(s: GameState): boolean {
  return s.winner !== null || s.draw;
}

/** Distribution of card values for the configured scale (uniform over a full deck). */
export function cardValueDistribution(rules: RuleConfig): number[] {
  return Array.from({ length: 52 }, (_, i) => cardValue(i, rules));
}

/** Probability the attacker wins: P(atkBase + atkCard > defBase + defCard). */
export function attackWinProbability(rules: RuleConfig, atkBase: number, defBase: number, atkCardValue?: number, extraAttackCard = false): number {
  if (rules.combat === 'none') return 1;
  const dist = cardValueDistribution(rules);
  let wins = 0;
  let total = 0;
  const atkVals = atkCardValue !== undefined ? [atkCardValue] : dist;
  const extras = extraAttackCard ? dist : [0];
  for (const av of atkVals)
    for (const ev of extras)
      for (const dv of dist) {
        total++;
        if (atkBase + av + ev > defBase + dv) wins++;
      }
  return wins / total;
}

export { nextRandom };
