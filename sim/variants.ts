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
  const core: Partial<RuleConfig> = { rescueMinDie: 6, supportBonus: 0 };
  return {
    'A: combined dice': { ...core, combineDice: true },
    'B: A + full armies': { ...core, combineDice: true, startingArmy: 'full' },
    'C: A + failed attacker captured': { ...core, combineDice: true, attackerLoss: 'captured' },
    'D: A + no extra doubles': { ...core, combineDice: true, doubles: 'none' },
    'E: separate dice only': { ...core, combineDice: false },
  };
}
