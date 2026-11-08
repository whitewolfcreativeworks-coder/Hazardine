import './style.css';
import {
  createGame,
  legalActions,
  applyAction,
  isOver,
  decode,
  rowOf,
  colOf,
  territoryOf,
  throneOf,
  cardLabel,
  cardValue,
  isRed,
  squareName,
  isOwnColor,
  barricadesInPlay,
  questRooms,
  QUEST_ROOM_NAMES,
  SQUARES,
  type GameState,
  type Action,
  type Player,
  type Kind,
  type RuleConfig,
} from '../src/engine';
import { makeAgent, type Agent } from '../src/ai/agents';

const GLYPH: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const KIND_NAME: Record<Kind, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const SIDE = ['Ivory', 'Ebony'];
/** Each army's color: its checkers, and its ground in the battle zone. */
const COLOR = ['red', 'black'];

const PRESETS: Record<string, Partial<RuleConfig>> = {
  default: {},
  full: { startingArmy: 'full' },
  classic: { combat: 'none' },
  nomuster: { muster: 'off' },
  quest: { quest: 'win', firstTurnOneDie: false },
  questBoons: { quest: 'boons', firstTurnOneDie: false },
};

type Mode = 'hvc' | 'hvh' | 'cvc';
type Pick = { t: 'idle' } | { t: 'piece'; from: number } | { t: 'barricade' } | { t: 'rescue'; kind: Kind } | { t: 'deploy'; kind: Kind } | { t: 'muster'; kind: Kind };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let game: GameState;
let mode: Mode = 'hvc';
let aiSpec = 'heuristic:balanced';
let preset = 'default';
let bots: (Agent | null)[] = [null, null];
let pick: Pick = { t: 'idle' };
let cardChoice = 0;
let lastMove: { from?: number; to: number } | null = null;
let botTimer: number | undefined;

function newGame(seed = Math.floor(Math.random() * 1e6) + 1) {
  clearTimeout(botTimer);
  game = createGame(seed, PRESETS[preset], { log: true });
  bots = [mode === 'cvc' ? makeAgent(aiSpec, seed + 1) : null, mode === 'hvh' ? null : makeAgent(aiSpec, seed + 2)];
  pick = { t: 'idle' };
  lastMove = null;
  cardChoice = bestCardIndex(0);
  render();
  scheduleBot();
}

const isHumanTurn = () => !isOver(game) && !bots[game.toMove];

function bestCardIndex(p: Player) {
  const hand = game.hands[p];
  let best = 0;
  hand.forEach((c, i) => {
    if (cardValue(c, game.rules) > cardValue(hand[best], game.rules)) best = i;
  });
  return best;
}

// ---------- layout ----------

function portrait() {
  return window.matchMedia('(max-aspect-ratio: 1/1)').matches;
}

/** Grid position for a square; Ivory (Player A) sits at the bottom or the left. */
function cellPos(s: number) {
  const r = rowOf(s);
  const c = colOf(s);
  return portrait() ? { x: c + 1, y: 24 - r } : { x: r + 1, y: 8 - c };
}

// ---------- actions for the current pick ----------

function actionsForPick(): Map<number, Action[]> {
  const out = new Map<number, Action[]>();
  if (!isHumanTurn()) return out;
  const add = (to: number, a: Action) => out.set(to, [...(out.get(to) ?? []), a]);
  for (const a of legalActions(game)) {
    if (pick.t === 'piece' && (a.t === 'move' || a.t === 'demolish' || a.t === 'takeover') && a.from === pick.from) add(a.to, a);
    if (pick.t === 'barricade' && a.t === 'barricade') add(a.to, a);
    if (pick.t === 'rescue' && a.t === 'rescue' && a.kind === pick.kind) add(a.to, a);
    if (pick.t === 'deploy' && a.t === 'deploy' && a.kind === pick.kind) add(a.to, a);
    if (pick.t === 'muster' && a.t === 'muster' && a.kind === pick.kind) add(a.to, a);
  }
  return out;
}

/** Among actions to the same square, prefer the chosen card and the cheapest dice. */
function pickAction(cands: Action[]): Action[] {
  let list = cands;
  const withCard = list.filter((a) => a.t === 'move' && a.card === cardChoice);
  if (withCard.length) list = withCard;
  const cost = (a: Action) => ('dice' in a ? a.dice.reduce((x, i) => x + game.dice[i] * (a.dice.length > 1 ? 10 : 1), 0) : 0);
  const minCost = Math.min(...list.map(cost));
  return list.filter((a) => cost(a) === minCost);
}

function take(a: Action) {
  const mover = game.toMove;
  if (a.t === 'move') lastMove = { from: a.from, to: a.to };
  else if ('to' in a) lastMove = { to: a.to };
  applyAction(game, a);
  pick = { t: 'idle' };
  if (game.toMove !== mover || game.lastCombat) cardChoice = bestCardIndex(game.toMove);
  cardChoice = Math.min(cardChoice, Math.max(0, game.hands[game.toMove].length - 1));
  render();
  scheduleBot();
}

function onSquare(s: number) {
  if (!isHumanTurn()) return;
  const targets = actionsForPick();
  if (targets.has(s)) {
    const opts = pickAction(targets.get(s)!);
    if (opts.length > 1 && opts.every((a) => a.t === 'move' && a.reward)) return chooseReward(opts as Extract<Action, { t: 'move' }>[]);
    const all = targets.get(s)!;
    const over = all.find((a) => a.t === 'takeover');
    const down = all.find((a) => a.t === 'demolish');
    if (over && down) return chooseBarricade(over, down);
    return take(opts[0]);
  }
  const piece = decode(game.board[s]);
  if (piece && piece.owner === game.toMove) {
    pick = pick.t === 'piece' && pick.from === s ? { t: 'idle' } : { t: 'piece', from: s };
  } else pick = { t: 'idle' };
  render();
}

function chooseBarricade(over: Action, down: Action) {
  const box = $('reward-options');
  box.innerHTML = '';
  ($('dlg-reward').querySelector('h2') as HTMLElement).textContent = 'Enemy barricade';
  ($('dlg-reward').querySelector('p') as HTMLElement).textContent = 'Take it over with one of your checkers, or knock it down.';
  const opt = (label: string, a: Action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reward';
    b.textContent = label;
    b.onclick = () => {
      ($('dlg-reward') as HTMLDialogElement).close();
      take(a);
    };
    box.append(b);
  };
  opt('Take it over (any die, uses one of your checkers)', over);
  opt(`Knock it down (a ${game.rules.demolishMinDie} or higher)`, down);
  ($('dlg-reward') as HTMLDialogElement).showModal();
}

function chooseReward(opts: Extract<Action, { t: 'move' }>[]) {
  ($('dlg-reward').querySelector('h2') as HTMLElement).textContent = 'Your pawn crossed into enemy land';
  ($('dlg-reward').querySelector('p') as HTMLElement).textContent = 'Choose its reward.';
  const box = $('reward-options');
  box.innerHTML = '';
  for (const a of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reward';
    const verb = a.rewardType === 'promote' ? 'Become a' : 'Send home a';
    b.innerHTML = `<span class="glyph side-${game.toMove}">${GLYPH[a.reward!]}</span><span>${verb} ${KIND_NAME[a.reward!].toLowerCase()}</span>`;
    b.onclick = () => {
      ($('dlg-reward') as HTMLDialogElement).close();
      take(a);
    };
    box.append(b);
  }
  ($('dlg-reward') as HTMLDialogElement).showModal();
}

// ---------- bots ----------

function scheduleBot() {
  clearTimeout(botTimer);
  if (isOver(game)) return;
  const bot = bots[game.toMove];
  if (!bot) return;
  const delay = game.lastCombat ? 1100 : mode === 'cvc' ? 380 : 520;
  botTimer = window.setTimeout(() => {
    const a = bot.choose(game);
    take(a);
  }, delay);
}

// ---------- rendering ----------

let musterShown = false;
function maybeAskMuster() {
  const pm = game.pendingMuster;
  if (!pm || !isHumanTurn()) {
    musterShown = false;
    return;
  }
  if (musterShown || pick.t === 'muster') return;
  musterShown = true;
  const box = $('muster-options');
  box.innerHTML = '';
  const dieFor = (k: Kind) => pm.rolls.filter((d) => game.rules.musterMap[d - 1] === k);
  $('muster-roll').textContent = `You rolled ${pm.rolls.join(' and ')}.`;
  for (const k of pm.options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reward';
    b.innerHTML = `<span class="glyph side-${pm.player}">${GLYPH[k]}</span><span>${KIND_NAME[k]} <span class="muted">(die ${dieFor(k).join(' or ')})</span></span>`;
    b.onclick = () => {
      ($('dlg-muster') as HTMLDialogElement).close();
      pick = { t: 'muster', kind: k };
      render();
    };
    box.append(b);
  }
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'ghost';
  skip.textContent = 'Skip this muster';
  skip.onclick = () => {
    ($('dlg-muster') as HTMLDialogElement).close();
    take({ t: 'skipMuster' });
  };
  box.append(skip);
  ($('dlg-muster') as HTMLDialogElement).showModal();
}

function render() {
  renderBoard();
  renderTray();
  maybeAskMuster();
}

function renderBoard() {
  const board = $('board');
  const vertical = portrait();
  board.classList.toggle('vertical', vertical);
  board.style.gridTemplateColumns = `repeat(${vertical ? 8 : 24}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${vertical ? 24 : 8}, 1fr)`;
  const targets = actionsForPick();
  const frag = document.createDocumentFragment();
  const thrones = [throneOf(0), throneOf(1)];
  for (let s = 0; s < SQUARES; s++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    const { x, y } = cellPos(s);
    cell.style.gridColumn = String(x);
    cell.style.gridRow = String(y);
    const terr = territoryOf(s);
    const dark = (rowOf(s) + colOf(s)) % 2 === 0;
    cell.className = `sq ${terr === 1 ? (dark ? 'mid-dark' : 'mid-light') : dark ? 'home-dark' : 'home-light'}`;
    if (rowOf(s) === 8) cell.classList.add('zone-start');
    if (rowOf(s) === 15) cell.classList.add('zone-end');
    if (game.rules.battleZone === 'colorGround' && terr === 1 && pick.t === 'piece') {
      const mover = decode(game.board[pick.from]);
      if (mover && isOwnColor(s, mover.owner)) {
        cell.classList.add('own-ground');
        cell.dataset.bonus = String(game.rules.battleBonus);
      }
    }
    if (thrones.includes(s)) cell.classList.add('throne');
    if (game.rules.quest !== 'off') {
      for (const q of [0, 1] as Player[]) {
        if (questRooms(q, game.questStage[q]).includes(s)) {
          const m = document.createElement('span');
          m.className = `room room-${q}`;
          m.title = `${SIDE[q]}'s next room: ${QUEST_ROOM_NAMES[game.questStage[q]]}`;
          cell.append(m);
        }
      }
    }
    if (lastMove && (lastMove.to === s || lastMove.from === s)) cell.classList.add('last');
    if (pick.t === 'piece' && pick.from === s) cell.classList.add('selected');
    if (game.arrived.includes(s)) cell.classList.add('arrived');
    const p = decode(game.board[s]);
    let label = squareName(s);
    if (game.barricade[s] !== -1) {
      const d = document.createElement('span');
      d.className = `barricade side-${game.barricade[s]}`;
      const height = game.checkerStack[s] + game.checkerStack[SQUARES + s];
      if (height > 1) d.dataset.stack = String(height);
      cell.append(d);
      label += `, ${SIDE[game.barricade[s]]} barricade`;
    }
    if (p) {
      const g = document.createElement('span');
      g.className = `glyph side-${p.owner}${p.veteran ? ' veteran' : ''}`;
      g.textContent = GLYPH[p.kind];
      cell.append(g);
      label += `, ${SIDE[p.owner]} ${KIND_NAME[p.kind]}`;
    }
    if (targets.has(s)) {
      const a = targets.get(s)![0];
      const attack = (a.t === 'move' && !!game.board[s]) || a.t === 'demolish' || a.t === 'takeover';
      cell.classList.add(attack ? 'target-attack' : 'target');
    }
    cell.setAttribute('aria-label', label);
    cell.onclick = () => onSquare(s);
    frag.append(cell);
  }
  board.replaceChildren(frag);
}

const PIP_LAYOUT: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function die(v: number, spent = false) {
  const d = document.createElement('span');
  d.className = `die${spent ? ' spent' : ''}`;
  d.setAttribute('aria-label', `die showing ${v}`);
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('i');
    if (PIP_LAYOUT[v].includes(i)) pip.className = 'pip';
    d.append(pip);
  }
  return d;
}

function cardEl(c: number, extra = '') {
  const el = document.createElement('span');
  el.className = `card ${isRed(c) ? 'red' : 'black'} ${extra}`;
  el.innerHTML = `<b>${cardLabel(c)}</b><small>+${cardValue(c, game.rules)}</small>`;
  return el;
}

function renderTray() {
  const p = game.toMove;
  const over = isOver(game);
  const turnLabel = $('turn-label');
  if (over) {
    turnLabel.textContent = game.draw ? 'Draw' : `${SIDE[game.winner!]} wins`;
  } else {
    turnLabel.innerHTML = `<span class="glyph side-${p}">♚</span> ${SIDE[p]} to play${bots[p] ? ' (computer)' : ''}`;
  }
  const dice = $('dice');
  dice.replaceChildren();
  if (!over) {
    const remaining = game.dice.slice();
    for (const v of game.rolled) {
      const i = remaining.indexOf(v);
      if (i >= 0) remaining.splice(i, 1);
      dice.append(die(v, i < 0));
    }
  }
  $('deck').textContent = game.rules.combat === 'cards' ? `Deck ${game.deck.length} cards, discard ${game.discard.length}` + (game.discard.length ? `, top ${cardLabel(game.discard[game.discard.length - 1])}` : '') : '';
  $('status').textContent = over
    ? game.draw
      ? 'The turn limit was reached.'
      : game.winReason === 'throne taken'
        ? 'The enemy throne has fallen.'
        : 'The enemy king was captured.'
    : statusHint();

  // Combat
  const combat = $('combat');
  const lc = game.lastCombat;
  combat.hidden = !lc;
  if (lc) {
    combat.innerHTML = '';
    const row = (side: Player, kind: Kind, base: number, card: number, total: number) => {
      const r = document.createElement('div');
      r.className = 'combat-row';
      r.innerHTML = `<span class="glyph side-${side}">${GLYPH[kind]}</span><span>${base}</span><span>+</span>`;
      r.append(cardEl(card));
      r.insertAdjacentHTML('beforeend', `<span>=</span><strong>${total}</strong>`);
      return r;
    };
    const atkRow = row(lc.attacker, lc.attackerKind, lc.attackBase, lc.attackCard, lc.attackTotal);
    if (lc.chargeCard !== undefined) atkRow.querySelector('.card')!.after(cardEl(lc.chargeCard, 'charge'));
    combat.append(atkRow);
    combat.append(row((1 - lc.attacker) as Player, lc.defenderKind, lc.defenseBase, lc.defenseCard, lc.defenseTotal));
    const verdict = document.createElement('p');
    verdict.className = 'verdict';
    verdict.textContent = lc.attackerWon ? `${KIND_NAME[lc.defenderKind]} captured and sent to jail.` : `Attack repelled. Ties go to the defender.`;
    combat.append(verdict);
    if (game.rules.battleZone === 'colorGround') {
      const notes: string[] = [];
      if (isOwnColor(lc.from, lc.attacker)) notes.push(`${SIDE[lc.attacker]} fought from ${COLOR[lc.attacker]} ground, +${game.rules.battleBonus}.`);
      const def = (1 - lc.attacker) as Player;
      if (isOwnColor(lc.to, def)) notes.push(`${SIDE[def]} held ${COLOR[def]} ground, +${game.rules.battleBonus}.`);
      if (notes.length) combat.insertAdjacentHTML('beforeend', `<p class="ground-note">${notes.join(' ')}</p>`);
    }
    if (territoryOf(lc.to) === 1) document.querySelector(`#board .sq:nth-child(${lc.to + 1})`)?.classList.add('clash');
  }

  const lt = game.lastTrial;
  if (lt && !lc) {
    combat.hidden = false;
    combat.innerHTML = '';
    const r = document.createElement('div');
    r.className = 'combat-row';
    r.innerHTML = `<span class="glyph side-${lt.player}">${GLYPH[lt.kind]}</span><span>${lt.strength}</span><span>+</span>`;
    r.append(cardEl(lt.card));
    r.insertAdjacentHTML('beforeend', `<span>=</span><strong>${lt.total}</strong><span class="muted">needs ${lt.target}</span>`);
    combat.append(r);
    const v = document.createElement('p');
    v.className = 'verdict';
    v.textContent = lt.passed
      ? `${SIDE[lt.player]} clears ${QUEST_ROOM_NAMES[lt.room]} and gains ${lt.boon}.`
      : `${QUEST_ROOM_NAMES[lt.room]} claims the ${KIND_NAME[lt.kind].toLowerCase()}. It goes to jail.`;
    combat.append(v);
  }

  // Hand
  const handWrap = document.querySelector('.hand-wrap') as HTMLElement;
  const human = isHumanTurn();
  const showHand = game.rules.combat === 'cards' && game.rules.handSize > 0 && (human || mode === 'cvc');
  handWrap.hidden = !showHand;
  handWrap.querySelector('h2')!.textContent = mode === 'hvh' || bots[p] ? `${SIDE[p]}'s hand` : 'Your hand';
  (handWrap.querySelector('.hint') as HTMLElement).hidden = !human;
  const hand = $('hand');
  hand.replaceChildren();
  if (showHand) {
    game.hands[p].forEach((c, i) => {
      const el = cardEl(c, i === cardChoice && human ? 'chosen' : '');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card-btn';
      b.setAttribute('aria-pressed', String(i === cardChoice));
      b.append(el);
      b.disabled = !human;
      b.onclick = () => {
        cardChoice = i;
        render();
      };
      hand.append(b);
    });
  }

  // Camps
  const legal = human ? legalActions(game) : [];
  for (const q of [0, 1] as Player[]) {
    const camp = $(`camp-${q}`);
    camp.innerHTML = `<h3><span class="glyph side-${q}">♚</span> ${SIDE[q]} <span class="army-color color-${q}">${COLOR[q]}</span></h3>`;
    const line = (title: string, kinds: Kind[], kindAction: 'rescue' | 'deploy' | null, empty: string) => {
      const div = document.createElement('div');
      div.className = 'camp-line';
      div.innerHTML = `<span class="camp-title">${title}</span>`;
      const list = document.createElement('span');
      list.className = 'camp-list';
      if (!kinds.length) list.innerHTML = `<span class="muted">${empty}</span>`;
      kinds.forEach((k) => {
        const can = kindAction && q === p && legal.some((a) => a.t === kindAction && a.kind === k);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `mini glyph side-${q}${can ? ' can' : ''}`;
        b.textContent = GLYPH[k];
        b.disabled = !can;
        b.title = can ? `${kindAction === 'rescue' ? 'Rescue' : 'Deploy'} ${KIND_NAME[k].toLowerCase()}` : KIND_NAME[k];
        b.onclick = () => {
          pick = { t: kindAction!, kind: k } as Pick;
          render();
        };
        list.append(b);
      });
      div.append(list);
      camp.append(div);
    };
    if (game.rules.quest !== 'off') {
      const qd = document.createElement('div');
      qd.className = 'camp-line';
      const steps = QUEST_ROOM_NAMES.map((n, i) => `<span class="step${i < game.questStage[q] ? ' done' : i === game.questStage[q] ? ' next' : ''}">${n.replace('The ', '')}</span>`).join('');
      qd.innerHTML = `<span class="camp-title">Quest</span><span class="camp-list quest-steps">${steps}${game.shields[q] ? `<span class="shield" title="Shields">🛡 ${game.shields[q]}</span>` : ''}</span>`;
      camp.append(qd);
    }
    line('In jail', game.jail[q], 'rescue', 'none');
    line('Earned', game.ready[q], 'deploy', 'none');
    const bar = document.createElement('div');
    bar.className = 'camp-line';
    const standing = barricadesInPlay(game, q);
    const cap = game.rules.barricadeLimit ? ` of ${game.rules.barricadeLimit}` : '';
    bar.innerHTML = `<span class="camp-title">Checkers</span><span class="camp-list">${game.barricadeStock[q]} in hand, ${standing}${cap} standing</span>`;
    camp.append(bar);
  }

  const canBarricade = legal.some((a) => a.t === 'barricade');
  const btnB = $('btn-barricade') as HTMLButtonElement;
  btnB.hidden = game.rules.barricades === 0;
  btnB.disabled = !canBarricade;
  btnB.classList.toggle('active', pick.t === 'barricade');
  ($('btn-end') as HTMLButtonElement).disabled = !human || !!game.pendingMuster;

  // Log
  const log = $('log');
  log.replaceChildren(
    ...game.log
      .slice(-60)
      .reverse()
      .map((l) => {
        const li = document.createElement('li');
        li.textContent = l;
        return li;
      }),
  );
}

function statusHint(): string {
  if (!isHumanTurn()) return 'Thinking…';
  if (pick.t === 'barricade') return 'Tap a glowing square to place a barricade.';
  if (pick.t === 'rescue') return `Tap a home square to return your ${KIND_NAME[pick.kind].toLowerCase()}.`;
  if (pick.t === 'deploy') return `Tap a home square to deploy your ${KIND_NAME[pick.kind].toLowerCase()}.`;
  if (pick.t === 'muster') return `Tap a square on your back row to place the ${KIND_NAME[pick.kind].toLowerCase()}.`;
  if (game.pendingMuster) return 'End of turn muster: choose which piece to bring out.';
  if (pick.t === 'piece' && game.arrived.includes(pick.from)) return 'This piece just entered the battle zone. It can act again next turn.';
  if (pick.t === 'piece') {
    const n = actionsForPick().size;
    return n ? 'Tap a highlighted square. Rings mark attacks.' : 'That piece has no moves with these dice.';
  }
  const only = legalActions(game).length === 1;
  return only ? 'No moves with these dice. End your turn.' : 'Each die is one action. Tap a piece to move it.';
}

// ---------- rules text ----------

function rulesHtml(r: RuleConfig) {
  const range = r.rangeMode === 'die' ? 'Queens, rooks and bishops slide up to the number on the die.' : 'Queens, rooks and bishops slide any distance.';
  const pawn = r.pawnMode === 'half' ? 'Pawns step forward up to half the die (rounded up) and attack one square diagonally forward.' : 'Pawns step one square forward and attack one square diagonally forward.';
  return `
  <p><strong>Goal.</strong> Capture the enemy king${r.victory === 'kingOrThrone' ? ', or move any piece onto the square where the enemy king started (the throne)' : ''}.</p>
  <p><strong>The field.</strong> Three boards end to end: your homeland, the red-and-black battle zone, and the enemy homeland.</p>
  ${r.battleZone === 'colorGround' ? `<p><strong>Battle ground.</strong> Ivory's color is red and Ebony's is black, the same as their checkers. In the battle zone, a piece fighting from a square of its own color gets +${r.battleBonus}, attacking or defending. When you select a piece, its own-color squares show +${r.battleBonus}.</p>` : ''}
  <p><strong>Your turn.</strong> Roll two dice. Each die is one action.${r.firstTurnOneDie ? ' Ivory rolls only one die on the very first turn.' : ''}${r.doubles === 'three' ? ' Doubles give you three actions.' : r.doubles === 'four' ? ' Doubles give you four actions.' : ''}${r.combineDice ? ' You can also spend both dice on one long move.' : ''} End your turn whenever you like.</p>
  <p><strong>Moving.</strong> ${range} Knights and kings move as in chess with any die. ${pawn}</p>
  ${
    r.combat === 'cards'
      ? `<p><strong>Attacking.</strong> Moving onto an enemy starts a fight. Each side adds its unit strength (pawn ${r.strength.P}, knight and bishop ${r.strength.N}, rook ${r.strength.R}, queen ${r.strength.Q}, king ${r.strength.K}), +${r.supportBonus} for each friendly neighbour (up to ${r.supportCap}), and a card. ${r.handSize ? `Attackers choose a card from a hand of ${r.handSize}; defenders draw blind.` : 'Both sides draw blind.'} Defenders get +${r.homeDefense} at home${r.barricades ? ` and +${r.fortBonus} beside their own barricade` : ''}. Higher total wins; ties go to the defender. A beaten attacker ${r.attackerLoss === 'repelled' ? 'stays where it was' : 'is captured'}.</p>`
      : '<p><strong>Attacking.</strong> Moving onto an enemy captures it, as in chess.</p>'
  }
  ${r.enterZone === 'stop' ? `<p><strong>Entering the battle zone.</strong> A piece moving into the battle zone must stop on an empty square. It can't attack into the zone, pass straight through it, or act again that turn. It fights from your next turn.</p>` : ''}
  ${r.muster !== 'off' ? `<p><strong>Muster.</strong> The first time each of your pieces moves forward from your homeland into the battle zone, it breaks the seal and earns a muster (kings too). At the end of your turn, roll two dice for each muster and choose one: ${[1, 2, 3, 4, 5, 6].map((d) => `${d} = ${KIND_NAME[r.musterMap[d - 1]].toLowerCase()}`).join(', ')}. Place that piece free on your back row. If a die's piece has run out of your supply, that die doesn't count. Each piece breaks the seal only once.</p>` : ''}
  ${r.combat === 'cards' ? `<p><strong>Cards at the table.</strong> One shared deck sits face down, with a face-up discard pile beside it. To attack, lay your chosen card face down; the defender turns over the top card of the deck; then reveal. Both cards go on the discard pile and the attacker draws back up to ${r.handSize}. When the deck runs out, shuffle the discard pile into a new deck.</p>` : ''}
  ${r.captureMode === 'jail' ? `<p><strong>Jail.</strong> Captured pieces go to jail. Spend a die of ${r.rescueMinDie} or more to bring one back to your home rows.</p>` : ''}
  ${r.promotionMode !== 'none' ? `<p><strong>Crossing.</strong> A pawn that reaches ${r.promotionZone === 'enemyHome' ? 'the enemy homeland' : 'the far edge'} ${r.promotionMode === 'reinforce' ? 'earns a new piece. Spend any die to deploy it on your home rows.' : r.promotionMode === 'promote' ? 'becomes a stronger piece.' : 'either becomes a stronger piece or earns one at home.'}</p>` : ''}
  ${r.barricades ? `<p><strong>Barricades.</strong> Spend a die to place one of your ${r.barricades} checkers (Ivory red, Ebony black) next to your pieces (not in enemy land).${r.barricadeLimit ? ` At most ${r.barricadeLimit} of yours may stand at once.` : ''} They block movement, and a defender beside its own barricade gets +${r.fortBonus}. An adjacent enemy can knock one down with a ${r.demolishMinDie} or higher; its checkers go back to their owners.${r.barricadeTakeover ? ' Or, with any die, stack one of your checkers on an enemy barricade next to your piece to take it over.' : ''}</p>` : ''}
  ${
    r.quest !== 'off'
      ? `<p><strong>Quest.</strong> Each side has three rooms (Ford, Crypt, Vault), marked on the board by its colour. When one of your pieces (not the king) ends a move on your next room, draw a card: strength + card must reach ${r.questDifficulty.join(', ')} for the three rooms. Pass and gain a boon: a new piece, then a shield, then ${r.quest === 'win' ? 'victory' : 'a queen and a freed prisoner'}. Fail and the piece goes to jail.${r.questLink ? ` Each room your rival clears makes your next trial ${r.questLink} easier.` : ''} <a href="quest-sheet.html" target="_blank" rel="noopener">Printable quest sheet</a>.</p>`
      : ''
  }
  <p class="muted">These rules are provisional. They come from simulation experiments and will change with playtesting.</p>`;
}

// ---------- wiring ----------

$('btn-end').onclick = () => isHumanTurn() && take({ t: 'end' });
$('btn-barricade').onclick = () => {
  pick = pick.t === 'barricade' ? { t: 'idle' } : { t: 'barricade' };
  render();
};
$('btn-new').onclick = () => {
  ($('opt-seed') as HTMLInputElement).value = String(Math.floor(Math.random() * 1e6) + 1);
  ($('dlg-new') as HTMLDialogElement).showModal();
};
$('btn-rules').onclick = () => {
  $('rules-body').innerHTML = rulesHtml(game.rules);
  ($('dlg-rules') as HTMLDialogElement).showModal();
};
($('dlg-new') as HTMLDialogElement).addEventListener('close', () => {
  if (($('dlg-new') as HTMLDialogElement).returnValue !== 'start') return;
  mode = ($('opt-mode') as HTMLSelectElement).value as Mode;
  aiSpec = ($('opt-ai') as HTMLSelectElement).value;
  preset = ($('opt-rules') as HTMLSelectElement).value;
  newGame(+($('opt-seed') as HTMLInputElement).value || undefined);
});
window.addEventListener('resize', () => renderBoard());

newGame();

// Test hook for automated browser checks (harmless in normal play).
(window as unknown as { __hazardine: unknown }).__hazardine = { get game() { return game; }, take, legalActions };
