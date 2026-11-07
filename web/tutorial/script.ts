/**
 * The Hazardine tutorial: narration lines and scripted chapters.
 *
 * Every board shown is a real engine state and every move, fight and trial is resolved by the
 * real rules engine. Cards are stacked into the deck so each example shows the intended outcome.
 * Narration lines are plain text so they can be voiced offline (see tools/narrate.py).
 */
import {
  createGame,
  legalActions,
  encode,
  sq,
  questRooms,
  throneOf,
  type GameState,
  type Action,
  type Kind,
  type Player,
  type RuleConfig,
} from '../../src/engine';

export const LINES: Record<string, string> = {
  intro1: "Welcome to Hazardine. In the next few minutes I'll teach you the whole game, on a real board.",
  board1: "The battlefield is three boards laid end to end. On the left is Ivory's homeland, a chessboard.",
  board2: 'In the middle is the battle zone, a red and black checkerboard. Most of the fighting happens here.',
  board3: "On the right is Ebony's homeland, another chessboard.",
  board4: 'Each king starts on its throne, marked with a gold ring. You win by capturing the enemy king, or by moving any piece onto the enemy throne.',

  setup1: 'Each side starts small: a king, a rook, a bishop, a knight, and six pawns. The rest of your two chess sets wait in reserve.',
  turn1: 'On your turn, roll two dice. Each die is one action.',
  turn2: 'Spend them one at a time, in any order. You can also join both dice into one long move. Doubles give you three actions.',
  turn3: 'To keep things fair, Ivory rolls only one die on the very first turn of the game.',

  move1: 'Pieces move as in chess, with one twist. The dice set the distance.',
  move2: 'This rook is spending a three, so it can slide up to three squares.',
  move3: 'With a six, it reaches twice as far. On a board twenty four squares long, that limit matters.',
  move4: 'Knights and kings move as in chess, whatever the die shows.',
  move5: 'Pawns step forward up to half the die, rounded up, and attack one square diagonally forward.',
  move6: 'Here, Ivory spends a five to push the rook into the middle.',

  fight1: "Moving onto an enemy piece starts a fight. Nothing is captured automatically.",
  fight2: 'Each side starts with its strength. Pawn two. Knight and bishop four. Rook six. Queen nine. King five.',
  fight3: 'The attacker chooses a card from a hand of three. The defender draws one blind from the deck.',
  fight4: 'Cards add one to five. Low cards add one. Kings and aces add five.',
  fight5: "Watch. Ivory's rook attacks Ebony's knight, playing a king.",
  fight6: 'Six plus five makes eleven, against four plus two. The knight is captured.',
  fight7: 'Defenders get one extra point in their own homeland, and two next to their own barricade. Ties always go to the defender.',
  fight8: 'Here, a lone pawn gambles an ace against a bishop at home. Seven against eight. The attack is repelled, and the pawn simply stays where it was.',

  zone1: "The red and black middle board is the battle zone. Red is Ivory's color, the same as its checkers. Black is Ebony's.",
  zone2: 'In the battle zone, a piece fighting from a square of its own color gets two extra points, attacking or defending. Pick your ground before you strike.',
  zone3: "Ivory's rook stands on red, so it attacks at eight. Ebony's bishop stands on black, so it defends at six. The cards add the rest, and the rook wins.",

  jail1: "Captured pieces aren't gone. They go to jail.",
  jail2: 'Roll a six, and you can spend it to bring a prisoner home to your back two rows.',
  jail3: "Rescue costs your best roll, so it's always a choice: free a prisoner, or press the attack.",

  cross1: 'When one of your pawns first reaches the enemy homeland, it earns a reward.',
  cross2: "Choose a queen, rook, bishop or knight from your reserve. It's earned, and waits at home.",
  cross3: 'Spend any die to deploy it on your back two rows.',
  cross4: 'Your supply is limited to two chess sets, so nobody can build an endless army.',

  bar1: 'Your checkers are barricades. Ivory places the four red checkers, and Ebony the four black.',
  bar2: 'Spend any die to place one next to your own piece, in your homeland or the middle.',
  bar3: 'Barricades block movement for everyone, and a defender standing beside its own barricade fights with two extra points.',
  bar4: 'An enemy piece next to a barricade can knock it down with a four or higher.',

  win1: 'There are two ways to win.',
  win2: "Capture the enemy king in a fight. Here, Ivory's queen catches the king in the open.",
  win3: "Or move any piece onto the enemy throne. Here, Ivory's knight slips onto Ebony's empty throne.",
  win4: "That's every rule. Now, how do you play well?",

  strat1: 'These tips come from thousands of simulated games.',
  strat2: 'Keep your throne guarded. An empty throne invites a raid, and the players who threatened thrones won about seven games in ten.',
  strat3: "Don't turtle. Players who walled themselves in behind barricades won fewer than one game in five.",
  strat4: 'Choose your fights. Attack with strong pieces, from outside the enemy homeland, and save your kings and aces for the fights that decide the game.',
  strat5: 'Pawns are investments, not an army. Push one or two across for reinforcements. Players who pushed every pawn almost never won.',
  strat6: 'Rescue when it buys you something. A six spent on a pawn is a six not spent on your attack.',

  quest1: 'For a role playing twist, try quest mode. Each side runs its own small dungeon, tracked in pencil on a printable sheet.',
  quest2: "Ivory's rooms are the Ford, the Crypt, and the Vault, marked with diamonds. Ebony's rooms mirror them, so the two quests cross in the middle.",
  quest3: 'End a move on your next room with any piece except the king, and face a trial. Strength plus a card must reach seven, then nine, then eleven.',
  quest4: 'Here, a rook enters the Ford. Six plus four makes ten. The room is cleared.',
  quest5: 'Each room gives a boon: a new piece, then a shield that blocks one capture, then the quest itself. Fail a trial, and the dungeon sends your piece to jail.',

  live1: "Let's finish with a real game between two computer players. Ivory plays aggressively. Ebony plays a balanced game.",
  live2: 'Ivory wins by capturing the king. Notice how many fights were decided before a single card was turned.',
  outro: "That's Hazardine. Every rule is still provisional, so play it, push it, and tell us what you find.",
};

export interface Stage {
  /** Show a state on the board and refresh every panel. */
  show(s: GameState): void;
  say(id: string): Promise<void>;
  wait(ms: number): Promise<void>;
  /** Apply a move with a sliding animation. */
  play(s: GameState, a: Action): Promise<void>;
  focus(opts: Focus): void;
  /** A short label pinned over the board (e.g. "Strength"). */
  note(text: string | null): void;
}

export interface Focus {
  territory?: 0 | 1 | 2 | null;
  squares?: number[];
  targets?: number[];
  attacks?: number[];
  thrones?: boolean;
  /** Show all three of Ivory's quest rooms, not just the next one. */
  allRooms?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  run(st: Stage): Promise<void>;
}

// ---------- helpers ----------

/** An empty board with both kings on their thrones and chosen dice. */
function fresh(dice: number[] = [], rules: Partial<RuleConfig> = {}, kings = true): GameState {
  const s = createGame(7, { firstTurnOneDie: false, ...rules }, { log: true });
  s.board.fill(0);
  s.barricade.fill(-1);
  s.dice = dice.slice();
  s.rolled = dice.slice();
  s.toMove = 0;
  s.log = [];
  if (kings) {
    s.board[throneOf(0)] = encode(0, 'K');
    s.board[throneOf(1)] = encode(1, 'K');
  }
  return s;
}

function put(s: GameState, p: Player, k: Kind, r: number, c: number, veteran = false) {
  s.board[sq(r, c)] = encode(p, k, veteran);
}

/** Every middle square of a player's color (their battle ground). */
function groundOf(p: Player): number[] {
  const out: number[] = [];
  for (let r = 8; r < 16; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === (p === 0 ? 1 : 0)) out.push(sq(r, c));
  return out;
}

/** Card ids: suit * 13 + rank index (0 = 2 ... 12 = Ace). Suits: spades, hearts, diamonds, clubs. */
const CARD = { FIVE_D: 2 * 13 + 3, KH: 1 * 13 + 11, SEVEN_C: 3 * 13 + 5, AD: 2 * 13 + 12, EIGHT_S: 0 * 13 + 6, AS: 0 * 13 + 12, TWO_C: 3 * 13 + 0, QH: 1 * 13 + 10, NINE_C: 3 * 13 + 7, FOUR_D: 2 * 13 + 2 };

/** Stack the deck for an attack: the attacker refills its hand first, then the defender draws blind. */
function stack(s: GameState, defenderCard: number) {
  s.deck.push(defenderCard, CARD.NINE_C);
}

function find(s: GameState, pred: (a: Action) => boolean): Action {
  const a = legalActions(s).find(pred);
  if (!a) throw new Error('tutorial: expected action not legal');
  return a;
}
const moveTo = (from: number, to: number, extra: (a: Extract<Action, { t: 'move' }>) => boolean = () => true) => (a: Action) =>
  a.t === 'move' && a.from === from && a.to === to && extra(a);

function targetsOf(s: GameState, from: number, dieIdx: number) {
  const out: number[] = [];
  const atk: number[] = [];
  for (const a of legalActions(s)) {
    if (a.t === 'move' && a.from === from && a.dice.length === 1 && a.dice[0] === dieIdx) (s.board[a.to] ? atk : out).push(a.to);
  }
  return { targets: [...new Set(out)], attacks: [...new Set(atk)] };
}

function opening(): GameState {
  const s = createGame(11, {}, { log: true });
  s.log = [];
  return s;
}

// ---------- chapters ----------

export const CHAPTERS: Chapter[] = [
  {
    id: 'field',
    title: 'The battlefield',
    async run(st) {
      const s = opening();
      s.dice = [];
      s.rolled = [];
      st.show(s);
      await st.say('intro1');
      st.focus({ territory: 0 });
      await st.say('board1');
      st.focus({ territory: 1 });
      await st.say('board2');
      st.focus({ territory: 2 });
      await st.say('board3');
      st.focus({ thrones: true, squares: [throneOf(0), throneOf(1)] });
      await st.say('board4');
      st.focus({});
    },
  },
  {
    id: 'turn',
    title: 'Armies and your turn',
    async run(st) {
      const s = opening();
      s.dice = [];
      s.rolled = [];
      st.show(s);
      await st.say('setup1');
      s.dice = [5, 3];
      s.rolled = [5, 3];
      st.show(s);
      await st.say('turn1');
      await st.say('turn2');
      s.dice = [4];
      s.rolled = [4];
      st.show(s);
      await st.say('turn3');
    },
  },
  {
    id: 'move',
    title: 'Moving',
    async run(st) {
      const s = fresh([3, 6]);
      put(s, 0, 'R', 5, 3);
      put(s, 0, 'N', 2, 6);
      put(s, 0, 'P', 3, 1);
      put(s, 1, 'P', 20, 2);
      put(s, 1, 'N', 21, 5);
      st.show(s);
      await st.say('move1');
      st.focus({ squares: [sq(5, 3)], ...targetsOf(s, sq(5, 3), 0) });
      await st.say('move2');
      st.focus({ squares: [sq(5, 3)], ...targetsOf(s, sq(5, 3), 1) });
      await st.say('move3');
      st.focus({ squares: [sq(2, 6)], ...targetsOf(s, sq(2, 6), 0) });
      await st.say('move4');
      s.dice = [5, 2];
      s.rolled = [5, 2];
      st.show(s);
      st.focus({ squares: [sq(3, 1)], ...targetsOf(s, sq(3, 1), 0) });
      await st.say('move5');
      st.focus({ squares: [sq(5, 3)], targets: [sq(10, 3)] });
      await st.say('move6');
      await st.play(s, find(s, moveTo(sq(5, 3), sq(10, 3))));
      st.focus({});
      await st.wait(600);
    },
  },
  {
    id: 'fight',
    title: 'Fighting',
    async run(st) {
      const s = fresh([1, 4]);
      put(s, 0, 'R', 11, 3);
      put(s, 1, 'N', 12, 3);
      put(s, 0, 'B', 3, 2);
      put(s, 1, 'P', 19, 6);
      s.hands[0] = [CARD.FOUR_D, CARD.KH, CARD.NINE_C];
      st.show(s);
      await st.say('fight1');
      st.note('Pawn 2  Knight 4  Bishop 4  Rook 6  Queen 9  King 5');
      await st.say('fight2');
      st.note(null);
      await st.say('fight3');
      await st.say('fight4');
      st.focus({ squares: [sq(11, 3)], attacks: [sq(12, 3)] });
      await st.say('fight5');
      stack(s, CARD.SEVEN_C);
      await st.play(s, find(s, moveTo(sq(11, 3), sq(12, 3), (a) => a.card === 1)));
      st.focus({});
      await st.say('fight6');
      await st.say('fight7');

      const t = fresh([1, 2]);
      put(t, 0, 'P', 16, 2, true);
      put(t, 1, 'B', 17, 3);
      put(t, 0, 'R', 12, 6);
      t.hands[0] = [CARD.AD, CARD.TWO_C, CARD.FOUR_D];
      st.show(t);
      st.focus({ squares: [sq(16, 2)], attacks: [sq(17, 3)] });
      await st.wait(500);
      stack(t, CARD.EIGHT_S);
      const say = st.say('fight8');
      await st.wait(1800);
      await st.play(t, find(t, moveTo(sq(16, 2), sq(17, 3), (a) => a.card === 0)));
      st.focus({});
      await say;
    },
  },
  {
    id: 'zone',
    title: 'The battle zone',
    async run(st) {
      const s = fresh([1, 3]);
      put(s, 0, 'R', 10, 1);
      put(s, 1, 'B', 11, 1);
      put(s, 0, 'N', 4, 2);
      put(s, 1, 'P', 20, 5);
      s.hands[0] = [CARD.NINE_C, CARD.TWO_C, CARD.FOUR_D];
      st.show(s);
      st.focus({ territory: 1 });
      await st.say('zone1');
      st.focus({ territory: 1, squares: groundOf(0) });
      await st.say('zone2');
      st.focus({ squares: [sq(10, 1)], attacks: [sq(11, 1)] });
      stack(s, CARD.FIVE_D);
      const say = st.say('zone3');
      await st.wait(4200);
      await st.play(s, find(s, moveTo(sq(10, 1), sq(11, 1), (a) => a.card === 0)));
      await say;
    },
  },
  {
    id: 'jail',
    title: 'Jail and rescue',
    async run(st) {
      const s = fresh([6, 2]);
      put(s, 0, 'R', 12, 3);
      put(s, 1, 'P', 21, 1);
      put(s, 1, 'P', 21, 6);
      put(s, 1, 'B', 22, 5);
      s.jail[1] = ['N'];
      s.toMove = 1;
      st.show(s);
      await st.say('jail1');
      await st.say('jail2');
      await st.play(s, find(s, (a) => a.t === 'rescue' && a.kind === 'N' && a.to === sq(22, 1)));
      st.focus({ squares: [sq(22, 1)] });
      await st.say('jail3');
      st.focus({});
    },
  },
  {
    id: 'cross',
    title: 'Crossing the field',
    async run(st) {
      const s = fresh([2, 3]);
      put(s, 0, 'P', 15, 4);
      put(s, 0, 'R', 1, 1);
      put(s, 1, 'N', 19, 1);
      put(s, 1, 'P', 21, 6);
      st.show(s);
      st.focus({ territory: 2, squares: [sq(15, 4)] });
      await st.say('cross1');
      await st.play(s, find(s, moveTo(sq(15, 4), sq(16, 4), (a) => a.reward === 'Q' && a.rewardType === 'reinforce')));
      st.focus({});
      await st.say('cross2');
      await st.play(s, find(s, (a) => a.t === 'deploy' && a.kind === 'Q' && a.to === sq(1, 3)));
      await st.say('cross3');
      await st.say('cross4');
    },
  },
  {
    id: 'barricade',
    title: 'Barricades',
    async run(st) {
      const s = fresh([1, 3]);
      put(s, 0, 'B', 9, 3);
      put(s, 0, 'P', 8, 5);
      put(s, 1, 'R', 12, 3);
      st.show(s);
      await st.say('bar1');
      await st.play(s, find(s, (a) => a.t === 'barricade' && a.to === sq(10, 3)));
      await st.say('bar2');
      st.focus({ squares: [sq(10, 3)] });
      await st.say('bar3');
      const t = fresh([5, 2]);
      t.barricade[sq(10, 3)] = 0;
      t.barricadeStock[0] = 3;
      put(t, 0, 'B', 9, 3);
      put(t, 1, 'N', 11, 3);
      t.toMove = 1;
      st.show(t);
      st.focus({ squares: [sq(11, 3)], attacks: [sq(10, 3)] });
      await st.wait(400);
      const say = st.say('bar4');
      await st.wait(1600);
      await st.play(t, find(t, (a) => a.t === 'demolish' && a.to === sq(10, 3)));
      st.focus({});
      await say;
    },
  },
  {
    id: 'win',
    title: 'Winning',
    async run(st) {
      const s = fresh([3, 1], {}, false);
      s.board[throneOf(0)] = encode(0, 'K');
      put(s, 1, 'K', 14, 4);
      put(s, 0, 'Q', 13, 4);
      put(s, 1, 'P', 20, 2);
      s.hands[0] = [CARD.AS, CARD.FOUR_D, CARD.TWO_C];
      st.show(s);
      await st.say('win1');
      st.focus({ squares: [sq(13, 4)], attacks: [sq(14, 4)] });
      stack(s, CARD.TWO_C);
      const say = st.say('win2');
      await st.wait(2400);
      await st.play(s, find(s, moveTo(sq(13, 4), sq(14, 4), (a) => a.card === 0)));
      st.focus({});
      await say;

      const t = fresh([2, 5], {}, false);
      t.board[throneOf(0)] = encode(0, 'K');
      put(t, 1, 'K', 20, 6);
      put(t, 0, 'N', 21, 3);
      put(t, 1, 'R', 18, 1);
      st.show(t);
      st.focus({ squares: [sq(21, 3)], targets: [throneOf(1)], thrones: true });
      const say2 = st.say('win3');
      await st.wait(2600);
      await st.play(t, find(t, moveTo(sq(21, 3), throneOf(1))));
      await say2;
      st.focus({});
      await st.say('win4');
    },
  },
  {
    id: 'strategy',
    title: 'Playing well',
    async run(st) {
      const a = opening();
      a.dice = [];
      a.rolled = [];
      st.show(a);
      await st.say('strat1');

      const raid = fresh([], {}, false);
      raid.board[throneOf(0)] = encode(0, 'K');
      put(raid, 1, 'K', 21, 6);
      put(raid, 0, 'R', 18, 4);
      put(raid, 0, 'N', 20, 2);
      put(raid, 1, 'P', 21, 2);
      st.show(raid);
      st.focus({ squares: [throneOf(1), sq(18, 4), sq(20, 2)], thrones: true });
      await st.say('strat2');

      const turtle = fresh([]);
      for (const [r, c] of [
        [1, 3],
        [1, 5],
        [0, 3],
        [0, 5],
      ])
        turtle.barricade[sq(r, c)] = 0;
      turtle.barricadeStock[0] = 0;
      put(turtle, 0, 'P', 1, 4);
      put(turtle, 0, 'B', 2, 4);
      put(turtle, 1, 'Q', 9, 4);
      put(turtle, 1, 'R', 8, 1);
      put(turtle, 1, 'N', 6, 6);
      st.show(turtle);
      st.focus({ territory: 0 });
      await st.say('strat3');

      const fight = fresh([]);
      put(fight, 0, 'R', 12, 2);
      put(fight, 1, 'P', 13, 2);
      put(fight, 0, 'P', 15, 5, true);
      put(fight, 1, 'R', 16, 6);
      fight.hands[0] = [CARD.AS, CARD.KH, CARD.FOUR_D];
      st.show(fight);
      st.focus({ squares: [sq(12, 2)], attacks: [sq(13, 2)] });
      await st.say('strat4');

      const pawns = fresh([]);
      put(pawns, 0, 'P', 15, 2);
      put(pawns, 0, 'P', 3, 3);
      put(pawns, 0, 'P', 3, 4);
      put(pawns, 0, 'R', 7, 4);
      put(pawns, 0, 'B', 5, 5);
      st.show(pawns);
      st.focus({ squares: [sq(15, 2)], targets: [sq(16, 2)] });
      await st.say('strat5');
      st.focus({});
      pawns.jail[0] = ['P', 'P'];
      pawns.dice = [6, 4];
      pawns.rolled = [6, 4];
      st.show(pawns);
      await st.say('strat6');
    },
  },
  {
    id: 'quest',
    title: 'Quest mode',
    async run(st) {
      const s = fresh([3, 1], { quest: 'win' });
      put(s, 0, 'R', 7, 1);
      put(s, 1, 'N', 15, 3);
      put(s, 1, 'P', 20, 4);
      st.show(s);
      await st.say('quest1');
      st.focus({ allRooms: true, squares: [...questRooms(0, 0), ...questRooms(0, 1), ...questRooms(0, 2)] });
      await st.say('quest2');
      st.focus({ squares: [sq(7, 1)], targets: [sq(10, 1)] });
      await st.say('quest3');
      s.deck.push(CARD.QH);
      const say = st.say('quest4');
      await st.wait(1200);
      await st.play(s, find(s, moveTo(sq(7, 1), sq(10, 1))));
      st.focus({});
      await say;
      await st.say('quest5');
    },
  },
];

/** The closing demonstration game (seed and agents chosen for a lively, typical game). */
export const LIVE_GAME = { seed: 50, ivory: 'heuristic:aggressive', ebony: 'heuristic:balanced' };
