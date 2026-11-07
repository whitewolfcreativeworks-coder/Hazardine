/**
 * Rule configuration for Hazardine.
 *
 * Every open design question in the spec is a knob here, so the simulation
 * lab can test alternatives against each other. Nothing in this file is
 * canonical: DEFAULT_RULES is simply the current provisional ruleset, chosen
 * from simulation results (see docs/EXPERIMENTS.md).
 */

export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

export interface RuleConfig {
  /** Which pieces each army starts with on the battlefield. */
  startingArmy: 'full' | 'reduced' | 'forward';

  /** How far sliding pieces (Q, R, B) may travel per action. 'die' = up to the die value. */
  rangeMode: 'die' | 'unlimited';
  /** How far a pawn may step forward per action. 'half' = up to ceil(die / 2). */
  pawnMode: 'one' | 'half';
  /** Allow spending both dice on a single long move (sum of the two values). */
  combineDice: boolean;
  /** What rolling doubles grants: nothing extra, a third action, or four actions. */
  doubles: 'none' | 'three' | 'four';

  /** How an attack is resolved. 'cards' = strength + card; 'none' = chess-style automatic capture. */
  combat: 'cards' | 'none';
  /** How a card's rank converts to combat value. 'full' = 2..14, 'tiered' = 1..5. */
  cardScale: 'full' | 'tiered';
  /** Cards an attacker holds and chooses from. 0 = blind draw. Defenders always draw blind. */
  handSize: number;
  /** What happens to an attacker that loses: it stays put, or it is captured. */
  attackerLoss: 'repelled' | 'captured';
  /** Bonus per adjacent friendly piece (both sides), capped at supportCap pieces. */
  supportBonus: number;
  supportCap: number;
  /** Bonus to a defender standing in its own homeland. */
  homeDefense: number;

  /** Captured pieces go to jail (rescuable) or are removed from the game. */
  captureMode: 'jail' | 'remove';
  /** Minimum die value needed to rescue a prisoner (0 disables rescue). */
  rescueMinDie: number;

  /** Where a pawn earns its advancement reward. */
  promotionZone: 'enemyHome' | 'backRank';
  /** The reward: become a stronger piece, earn a reinforcement at home, choose, or nothing. */
  promotionMode: 'promote' | 'reinforce' | 'choice' | 'none';

  /** Checker pieces used as barricades: how many each player may place (0 disables). */
  barricades: number;
  /** Bonus to a defender standing next to its own barricade. */
  fortBonus: number;
  /** Minimum die value to demolish an adjacent enemy barricade. */
  demolishMinDie: number;

  /** King capture only, or king capture OR occupying the enemy king's starting square. */
  victory: 'king' | 'kingOrThrone';
  /** Player-turns before the game is declared a draw. */
  maxTurns: number;

  /** Base combat strength of each unit class. */
  strength: Record<Kind, number>;
}

export const DEFAULT_STRENGTH: Record<Kind, number> = {
  K: 5,
  Q: 9,
  R: 6,
  B: 4,
  N: 4,
  P: 2,
};

/** Current provisional ruleset. Updated from simulation results; see docs/EXPERIMENTS.md. */
export const DEFAULT_RULES: RuleConfig = {
  startingArmy: 'reduced',
  rangeMode: 'die',
  pawnMode: 'half',
  combineDice: true,
  doubles: 'three',
  combat: 'cards',
  cardScale: 'tiered',
  handSize: 3,
  attackerLoss: 'repelled',
  supportBonus: 1,
  supportCap: 2,
  homeDefense: 1,
  captureMode: 'jail',
  rescueMinDie: 5,
  promotionZone: 'enemyHome',
  promotionMode: 'reinforce',
  barricades: 4,
  fortBonus: 2,
  demolishMinDie: 4,
  victory: 'kingOrThrone',
  maxTurns: 300,
  strength: { ...DEFAULT_STRENGTH },
};

export function makeRules(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return {
    ...DEFAULT_RULES,
    ...overrides,
    strength: { ...DEFAULT_RULES.strength, ...(overrides.strength ?? {}) },
  };
}
