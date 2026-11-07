import { describe, it, expect } from 'vitest';
import {
  createGame,
  legalActions,
  applyAction,
  isOver,
  sq,
  encode,
  decode,
  territoryOf,
  pieceTargets,
  attackWinProbability,
  makeRules,
  randInt,
  type GameState,
  type Action,
  SQUARES,
} from '../src/engine';

/** A blank board with controllable dice, for precise rule tests. */
function blank(rules: Parameters<typeof makeRules>[0] = {}, dice = [3, 5]): GameState {
  const s = createGame(42, rules);
  s.board.fill(0);
  s.barricade.fill(-1);
  s.dice = dice.slice();
  s.rolled = dice.slice();
  s.toMove = 0;
  return s;
}

function playRandom(seed: number, rules = {}) {
  const s = createGame(seed, rules);
  const r = { rng: seed * 31 + 7 };
  const actions: Action[] = [];
  while (!isOver(s)) {
    const a = legalActions(s);
    const x = a[randInt(r, a.length)];
    actions.push(x);
    applyAction(s, x);
  }
  return { s, actions };
}

describe('battlefield', () => {
  it('has three connected 8x8 territories (8 x 24 = 192 squares)', () => {
    expect(SQUARES).toBe(192);
    expect(territoryOf(sq(0, 0))).toBe(0);
    expect(territoryOf(sq(7, 7))).toBe(0);
    expect(territoryOf(sq(8, 0))).toBe(1);
    expect(territoryOf(sq(15, 7))).toBe(1);
    expect(territoryOf(sq(16, 0))).toBe(2);
    expect(territoryOf(sq(23, 7))).toBe(2);
  });

  it('lets pieces cross from one board into the next', () => {
    const s = blank({ rangeMode: 'die' }, [6, 1]);
    s.board[sq(5, 0)] = encode(0, 'R');
    const t = pieceTargets(s, sq(5, 0), 6);
    expect(t).toContain(sq(11, 0)); // homeland → middle
    s.board[sq(13, 0)] = encode(0, 'R');
    expect(pieceTargets(s, sq(13, 0), 6)).toContain(sq(19, 0)); // middle → enemy homeland
  });

  it('sets up two armies with the king on its throne', () => {
    const s = createGame(1, { startingArmy: 'full' });
    expect(decode(s.board[sq(0, 4)])).toMatchObject({ owner: 0, kind: 'K' });
    expect(decode(s.board[sq(23, 4)])).toMatchObject({ owner: 1, kind: 'K' });
    const count = (p: number) => Array.from(s.board).filter((c) => c && decode(c)!.owner === p).length;
    expect(count(0)).toBe(16);
    expect(count(1)).toBe(16);
  });
});

describe('movement and dice', () => {
  it('caps sliding range at the die value', () => {
    const s = blank({ rangeMode: 'die' });
    s.board[sq(4, 0)] = encode(0, 'R');
    const t = pieceTargets(s, sq(4, 0), 3);
    expect(t).toContain(sq(7, 0));
    expect(t).not.toContain(sq(8, 0));
  });

  it('allows unlimited range when configured', () => {
    const s = blank({ rangeMode: 'unlimited' });
    s.board[sq(4, 0)] = encode(0, 'R');
    expect(pieceTargets(s, sq(4, 0), 1)).toContain(sq(23, 0));
  });

  it('blocks sliders behind pieces and barricades', () => {
    const s = blank({ rangeMode: 'unlimited' });
    s.board[sq(4, 0)] = encode(0, 'R');
    s.barricade[sq(6, 0)] = 1;
    const t = pieceTargets(s, sq(4, 0), 6);
    expect(t).toContain(sq(5, 0));
    expect(t).not.toContain(sq(6, 0));
    expect(t).not.toContain(sq(7, 0));
  });

  it('moves pawns forward only and attacks diagonally', () => {
    const s = blank({ pawnMode: 'half' });
    s.board[sq(4, 3)] = encode(0, 'P');
    s.board[sq(5, 4)] = encode(1, 'P');
    const t = pieceTargets(s, sq(4, 3), 6);
    expect(t).toEqual(expect.arrayContaining([sq(5, 3), sq(6, 3), sq(7, 3), sq(5, 4)]));
    expect(t).not.toContain(sq(3, 3));
  });

  it('spends one die per action and ends the turn when dice run out', () => {
    const s = blank({}, [2, 3]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    const moves = legalActions(s).filter((a) => a.t === 'move');
    applyAction(s, moves[0]);
    expect(s.dice.length).toBe(1);
    expect(s.toMove).toBe(0);
    applyAction(s, legalActions(s).find((a) => a.t === 'move')!);
    expect(s.toMove).toBe(1);
    expect(s.dice.length).toBeGreaterThanOrEqual(2);
  });

  it('can combine both dice into one long move', () => {
    const s = blank({ combineDice: true, rangeMode: 'die' }, [2, 3]);
    s.board[sq(0, 0)] = encode(0, 'R');
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    const long = legalActions(s).find((a) => a.t === 'move' && a.to === sq(5, 0));
    expect(long).toBeDefined();
    expect((long as { dice: number[] }).dice.length).toBe(2);
  });

  it('grants extra actions on doubles when configured', () => {
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const s = createGame(seed, { doubles: 'three', firstTurnOneDie: false });
      if (s.rolled.length === 3) found = s.rolled.every((d) => d === s.rolled[0]);
    }
    expect(found).toBe(true);
  });
});

describe('card combat', () => {
  it('resolves attacks with strength plus cards, and captures into jail', () => {
    let captured = 0;
    let repelled = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame(seed, { handSize: 0 });
      s.board.fill(0);
      s.dice = [1, 1];
      s.toMove = 0;
      s.board[sq(0, 4)] = encode(0, 'K');
      s.board[sq(23, 4)] = encode(1, 'K');
      s.board[sq(10, 0)] = encode(0, 'R');
      s.board[sq(11, 0)] = encode(1, 'P');
      const attack = legalActions(s).find((a) => a.t === 'move' && a.to === sq(11, 0))!;
      applyAction(s, attack);
      expect(s.lastCombat).not.toBeNull();
      if (s.lastCombat!.attackerWon) {
        captured++;
        expect(s.jail[1]).toContain('P');
        expect(decode(s.board[sq(11, 0)])).toMatchObject({ owner: 0, kind: 'R' });
      } else {
        repelled++;
        expect(decode(s.board[sq(10, 0)])).toMatchObject({ owner: 0, kind: 'R' });
      }
    }
    expect(captured).toBeGreaterThan(repelled); // a rook should usually beat a pawn
  });

  it('makes stronger units more likely to win', () => {
    const r = makeRules();
    expect(attackWinProbability(r, 9, 2)).toBeGreaterThan(0.9);
    expect(attackWinProbability(r, 2, 9)).toBeLessThan(0.1);
    expect(attackWinProbability(r, 5, 5)).toBeLessThan(0.5); // ties go to the defender
  });

  it('lets an attacker choose a card from its hand', () => {
    const s = blank({ handSize: 3 }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(10, 0)] = encode(0, 'R');
    s.board[sq(11, 0)] = encode(1, 'P');
    const attacks = legalActions(s).filter((a) => a.t === 'move' && a.to === sq(11, 0));
    expect(attacks.length).toBe(3);
  });

  it('captures automatically when combat is off', () => {
    const s = blank({ combat: 'none' }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(10, 0)] = encode(0, 'P');
    s.board[sq(11, 1)] = encode(1, 'Q');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(11, 1))!);
    expect(decode(s.board[sq(11, 1)])).toMatchObject({ owner: 0, kind: 'P' });
    expect(s.jail[1]).toEqual(['Q']);
  });
});

describe('jail and rescue', () => {
  it('rescues a prisoner to the home rows with a high enough die', () => {
    const s = blank({ rescueMinDie: 5 }, [6, 2]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.jail[0] = ['R'];
    const rescues = legalActions(s).filter((a) => a.t === 'rescue');
    expect(rescues.length).toBeGreaterThan(0);
    expect(rescues.every((a) => a.t === 'rescue' && [0, 1].includes(Math.floor(a.to / 8)))).toBe(true);
    applyAction(s, rescues[0]);
    expect(s.jail[0]).toEqual([]);
    expect(s.stats.rescues[0]).toBe(1);
  });

  it('cannot rescue with low dice', () => {
    const s = blank({ rescueMinDie: 5 }, [2, 3]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.jail[0] = ['R'];
    expect(legalActions(s).some((a) => a.t === 'rescue')).toBe(false);
  });

  it('removes captured pieces entirely in remove mode', () => {
    const s = blank({ combat: 'none', captureMode: 'remove' }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(10, 0)] = encode(0, 'R');
    s.board[sq(11, 0)] = encode(1, 'N');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(11, 0))!);
    expect(s.jail[1]).toEqual([]);
  });
});

describe('advancement', () => {
  it('earns a reinforcement when a pawn enters enemy territory, deployable at home', () => {
    const s = blank({ promotionMode: 'reinforce', pawnMode: 'one' }, [1, 2]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(15, 2)] = encode(0, 'P');
    const m = legalActions(s).find((a) => a.t === 'move' && a.to === sq(16, 2) && a.reward === 'Q')!;
    applyAction(s, m);
    expect(s.ready[0]).toEqual(['Q']);
    expect(decode(s.board[sq(16, 2)])).toMatchObject({ kind: 'P', veteran: true });
    const deploy = legalActions(s).find((a) => a.t === 'deploy');
    expect(deploy).toBeDefined();
    applyAction(s, deploy!);
    expect(s.ready[0]).toEqual([]);
  });

  it('promotes the pawn itself in promote mode', () => {
    const s = blank({ promotionMode: 'promote', pawnMode: 'one' }, [1, 2]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(15, 2)] = encode(0, 'P');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(16, 2) && a.reward === 'R')!);
    expect(decode(s.board[sq(16, 2)])).toMatchObject({ owner: 0, kind: 'R' });
  });

  it('only rewards a pawn once', () => {
    const s = blank({ promotionMode: 'reinforce', pawnMode: 'one' }, [1, 2]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(16, 2)] = encode(0, 'P', true);
    expect(legalActions(s).some((a) => a.t === 'move' && a.reward)).toBe(false);
  });
});

describe('barricades', () => {
  it('places barricades next to your pieces and they block movement', () => {
    const s = blank({ barricades: 2 }, [3, 4]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(5, 0)] = encode(0, 'R');
    const place = legalActions(s).find((a) => a.t === 'barricade' && a.to === sq(6, 0))!;
    applyAction(s, place);
    expect(s.barricadeStock[0]).toBe(1);
    expect(pieceTargets(s, sq(5, 0), 4)).not.toContain(sq(6, 0));
  });

  it('lets an adjacent enemy demolish a barricade with a high die', () => {
    const s = blank({ barricades: 2, demolishMinDie: 4 }, [5, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(12, 3)] = encode(0, 'N');
    s.barricade[sq(13, 3)] = 1;
    const d = legalActions(s).find((a) => a.t === 'demolish');
    expect(d).toBeDefined();
    applyAction(s, d!);
    expect(s.barricade[sq(13, 3)]).toBe(-1);
  });
});

describe('victory', () => {
  it('ends the game when a king is captured', () => {
    const s = blank({ combat: 'none' }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(10, 4)] = encode(1, 'K');
    s.board[sq(9, 4)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(10, 4))!);
    expect(s.winner).toBe(0);
    expect(isOver(s)).toBe(true);
  });

  it('awards victory for taking the enemy throne when enabled', () => {
    const s = blank({ victory: 'kingOrThrone' }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(10, 0)] = encode(1, 'K');
    s.board[sq(22, 4)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(23, 4))!);
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('throne taken');
  });

  it('declares a draw at the turn limit', () => {
    const s = createGame(3, { maxTurns: 4 });
    while (!isOver(s)) applyAction(s, { t: 'end' });
    expect(s.draw).toBe(true);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed and actions', () => {
    const { s, actions } = playRandom(77);
    const replay = createGame(77);
    for (const a of actions) applyAction(replay, a);
    expect(replay.winner).toBe(s.winner);
    expect(Array.from(replay.board)).toEqual(Array.from(s.board));
    expect(replay.turn).toBe(s.turn);
  });

  it('always reaches an end state under random play', () => {
    for (let seed = 1; seed <= 20; seed++) expect(isOver(playRandom(seed).s)).toBe(true);
  });
});

describe('quest mode', () => {
  const setup = (rules: Parameters<typeof makeRules>[0], dice = [1, 1]) => {
    const s = blank({ quest: 'win', ...rules }, dice);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    return s;
  };

  it('gives each side three mirrored rooms', async () => {
    const { questRooms } = await import('../src/engine');
    expect(questRooms(0, 0)).toEqual([sq(10, 1), sq(10, 6)]);
    expect(questRooms(1, 0)).toEqual([sq(13, 6), sq(13, 1)]);
    expect(questRooms(0, 2).every((x) => territoryOf(x) === 2)).toBe(true);
    expect(questRooms(1, 2).every((x) => territoryOf(x) === 0)).toBe(true);
  });

  it('clears a room on a passed trial and grants a boon', () => {
    const s = setup({ questDifficulty: [1, 1, 1] });
    s.board[sq(9, 1)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(9, 1) && a.to === sq(10, 1))!);
    expect(s.lastTrial?.passed).toBe(true);
    expect(s.questStage[0]).toBe(1);
    expect(s.ready[0].length).toBe(1);
  });

  it('sends a piece that fails its trial to jail', () => {
    const s = setup({ questDifficulty: [99, 99, 99] });
    s.board[sq(9, 1)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(9, 1) && a.to === sq(10, 1))!);
    expect(s.lastTrial?.passed).toBe(false);
    expect(s.board[sq(10, 1)]).toBe(0);
    expect(s.jail[0]).toEqual(['R']);
  });

  it('wins the game on clearing the final room in win mode', () => {
    const s = setup({ questDifficulty: [1, 1, 1] });
    s.questStage[0] = 2;
    s.board[sq(18, 0)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(18, 0) && a.to === sq(19, 0))!);
    expect(s.winner).toBe(0);
    expect(s.winReason).toBe('quest complete');
  });

  it('a shield turns one lost defence into a repelled attack', () => {
    const s = setup({ quest: 'boons', combat: 'none' });
    s.board[sq(10, 0)] = encode(0, 'R');
    s.board[sq(11, 0)] = encode(1, 'P');
    s.shields[1] = 1;
    // combat 'none' skips cards, so test the shield through card combat instead
    const t = setup({ quest: 'boons' });
    t.board[sq(10, 0)] = encode(0, 'Q');
    t.board[sq(11, 0)] = encode(1, 'P');
    t.shields[1] = 1;
    applyAction(t, legalActions(t).find((a) => a.t === 'move' && a.to === sq(11, 0))!);
    expect(t.board[sq(11, 0)]).toBe(encode(1, 'P'));
    expect(t.shields[1]).toBe(0);
    expect(s.shields[1]).toBe(1);
  });

  it('linked quests make the rival\'s next trial easier', () => {
    const s = setup({ questDifficulty: [1, 1, 1], questLink: 2 });
    s.board[sq(9, 1)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(9, 1) && a.to === sq(10, 1))!);
    expect(s.questEase[1]).toBe(2);
  });
});

describe('first-turn handicap', () => {
  it('gives the first player one die on the opening turn', () => {
    const s = createGame(5, { firstTurnOneDie: true });
    expect(s.rolled.length).toBe(1);
    applyAction(s, { t: 'end' });
    expect(s.rolled.length).toBeGreaterThanOrEqual(2);
  });
});

describe('battle zone', () => {
  it('gives a piece +2 on a middle square of its own color', async () => {
    const { combatBase, isOwnColor } = await import('../src/engine');
    const s = blank({ battleZone: 'colorGround', battleBonus: 2, supportBonus: 0 });
    // Ivory is red: middle squares where row + col is odd.
    expect(isOwnColor(sq(10, 1), 0)).toBe(true);
    expect(isOwnColor(sq(10, 2), 1)).toBe(true);
    expect(isOwnColor(sq(3, 0), 0)).toBe(false); // homelands have no battle ground
    expect(combatBase(s, sq(10, 1), 0, 'R', false)).toBe(8);
    expect(combatBase(s, sq(10, 2), 0, 'R', false)).toBe(6);
  });

  it('adds a charge card for attacks into the middle when configured', () => {
    const s = blank({ battleZone: 'charge', handSize: 0 }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(10, 0)] = encode(0, 'R');
    s.board[sq(11, 0)] = encode(1, 'P');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.to === sq(11, 0))!);
    expect(s.lastCombat?.chargeCard).toBeDefined();
  });
});

describe('muster', () => {
  it('a piece entering the battle zone unlocks a new piece on the back row', () => {
    const s = blank({ muster: 'firstEntry' }, [2, 3]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(6, 2)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(6, 2) && a.to === sq(8, 2))!);
    expect(s.pendingMuster).not.toBeNull();
    const opts = legalActions(s);
    expect(opts.every((a) => a.t === 'muster' || a.t === 'skipMuster')).toBe(true);
    expect(opts.filter((a) => a.t === 'muster').every((a) => a.t === 'muster' && Math.floor(a.to / 8) === 0)).toBe(true);
    applyAction(s, opts.find((a) => a.t === 'muster')!);
    expect(s.pendingMuster).toBeNull();
    expect(s.stats.musters[0]).toBe(1);
    expect(s.toMove).toBe(0); // one die is still left
  });

  it('each piece unlocks only once in firstEntry mode', () => {
    const s = blank({ muster: 'firstEntry' }, [1, 1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(7, 2)] = encode(0, 'R', false, true); // already marched
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(7, 2) && a.to === sq(8, 2))!);
    expect(s.pendingMuster).toBeNull();
  });

  it('waits for the muster choice before ending the turn', () => {
    const s = blank({ muster: 'everyEntry' }, [1]);
    s.board[sq(0, 4)] = encode(0, 'K');
    s.board[sq(23, 4)] = encode(1, 'K');
    s.board[sq(7, 2)] = encode(0, 'R');
    applyAction(s, legalActions(s).find((a) => a.t === 'move' && a.from === sq(7, 2) && a.to === sq(8, 2))!);
    expect(s.toMove).toBe(0);
    applyAction(s, { t: 'skipMuster' });
    expect(s.toMove).toBe(1);
  });
});
