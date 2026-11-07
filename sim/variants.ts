/**
 * Variants for one-factor-at-a-time sweeps: each entry changes exactly one rule
 * relative to the base ruleset, so its effect can be read directly.
 */
import type { RuleConfig } from '../src/engine';

export function VARIANTS(_base: Partial<RuleConfig>): Record<string, Partial<RuleConfig>> {
  return {
    'baseline': {},
    'army: full': { startingArmy: 'full' },
    'army: forward pawns': { startingArmy: 'forward' },
    'range: unlimited': { rangeMode: 'unlimited' },
    'pawns: one step': { pawnMode: 'one' },
    'dice combining': { combineDice: true },
    'no dice combining': { combineDice: false },
    'doubles: none': { doubles: 'none' },
    'doubles: four': { doubles: 'four' },
    'combat: none (chess capture)': { combat: 'none' },
    'cards: full scale': { cardScale: 'full' },
    'cards: blind draw': { handSize: 0 },
    'failed attacker captured': { attackerLoss: 'captured' },
    'no support bonus': { supportBonus: 0 },
    'no home defense': { homeDefense: 0 },
    'capture: remove': { captureMode: 'remove' },
    'rescue: needs 5': { rescueMinDie: 5 },
    'rescue: needs 6': { rescueMinDie: 6 },
    'support bonus on': { supportBonus: 1 },
    'rescue: needs 3': { rescueMinDie: 3 },
    'reward: promote': { promotionMode: 'promote' },
    'reward: choice': { promotionMode: 'choice' },
    'reward: none': { promotionMode: 'none' },
    'reward zone: back rank': { promotionZone: 'backRank' },
    'no barricades': { barricades: 0 },
    'victory: king only': { victory: 'king' },
  };
}

/** Round 3: full candidate rulesets built from the round 1-2 winners, compared head to head with larger samples. */
export function CANDIDATES(): Record<string, Partial<RuleConfig>> {
  const core: Partial<RuleConfig> = { rescueMinDie: 6, supportBonus: 0, combineDice: true };
  return {
    'A: combined dice': { ...core },
    'A1: A + one-die opening': { ...core, firstTurnOneDie: true },
    'B1: A1 + full armies': { ...core, firstTurnOneDie: true, startingArmy: 'full' },
    'C1: A1 + failed attacker captured': { ...core, firstTurnOneDie: true, attackerLoss: 'captured' },
    'E1: A1 with separate dice only': { ...core, firstTurnOneDie: true, combineDice: false },
  };
}

/** Quest-mode scenarios ("two dungeons"), each on top of the current default ruleset. */
export function QUESTS(): Record<string, Partial<RuleConfig>> {
  return {
    'quests off (core game)': {},
    'quest: boons only': { quest: 'boons' },
    'quest: boons, linked +1': { quest: 'boons', questLink: 1 },
    'quest: completing it wins': { quest: 'win' },
    'quest: wins, linked +1': { quest: 'win', questLink: 1 },
    'quest: wins, easier rooms (6/8/10)': { quest: 'win', questDifficulty: [6, 8, 10] },
    'quest: wins, harder rooms (8/10/12)': { quest: 'win', questDifficulty: [8, 10, 12] },
  };
}
