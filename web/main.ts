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

const PRESETS: Record<string, Partial<RuleConfig>> = {
  default: {},
  full: { startingArmy: 'full' },
  classic: { combat: 'none' },
  quest: { quest: 'win', firstTurnOneDie: false },
  questBoons: { quest: 'boons', firstTurnOneDie: false },
};

type Mode = 'hvc' | 'hvh' | 'cvc';
type Pick = { t: 'idle' } | { t: 'piece'; from: number } | { t: 'barricade' } | { t: 'rescue'; kind: Kind } | { t: 'deploy'; kind: Kind };

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
    if (pick.t === 'piece' && (a.t === 'move' || a.t === 'demolish') && a.from === pick.from) add(a.to, a);
    if (pick.t === 'barricade' && a.t === 'barricade') add(a.to, a);
    if (pick.t === 'rescue' && a.t === 'rescue' && a.kind === pick.kind) add(a.to, a);
    if (pick.t === 'deploy' && a.t === 'deploy' && a.kind === pick.kind) add(a.to, a);
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
  else if (a.t !== 'end') lastMove = { to: a.to };
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
    return take(opts[0]);
  }
  const piece = decode(game.board[s]);
  if (piece && piece.owner === game.toMove) {
    pick = pick.t === 'piece' && pick.from === s ? { t: 'idle' } : { t: 'piece', from: s };
  } else pick = { t: 'idle' };
  render();
}

function chooseReward(opts: Extract<Action, { t: 'move' }>[]) {
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

function render() {
  renderBoard();
  renderTray();
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
    if (terr !== 1 && (rowOf(s) === 8 || rowOf(s) === 15 || rowOf(s) === 7 || rowOf(s) === 16)) cell.classList.add('frontier');
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
    const p = decode(game.board[s]);
    let label = squareName(s);
    if (game.barricade[s] !== -1) {
      const d = document.createElement('span');
      d.className = `barricade side-${game.barricade[s]}`;
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
      const attack = (a.t === 'move' && !!game.board[s]) || a.t === 'demolish';
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
    combat.append(row(lc.attacker, lc.attackerKind, lc.attackBase, lc.attackCard, lc.attackTotal));
    combat.append(row((1 - lc.attacker) as Player, lc.defenderKind, lc.defenseBase, lc.defenseCard, lc.defenseTotal));
    const verdict = document.createElement('p');
    verdict.className = 'verdict';
    verdict.textContent = lc.attackerWon ? `${KIND_NAME[lc.defenderKind]} captured and sent to jail.` : `Attack repelled. Ties go to the defender.`;
    combat.append(verdict);
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
    camp.innerHTML = `<h3><span class="glyph side-${q}">♚</span> ${SIDE[q]}</h3>`;
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
    bar.innerHTML = `<span class="camp-title">Barricades</span><span class="camp-list">${`<span class="barricade small side-${q}"></span>`.repeat(game.barricadeStock[q]) || '<span class="muted">none left</span>'}</span>`;
    camp.append(bar);
  }

  const canBarricade = legal.some((a) => a.t === 'barricade');
  const btnB = $('btn-barricade') as HTMLButtonElement;
  btnB.hidden = game.rules.barricades === 0;
  btnB.disabled = !canBarricade;
  btnB.classList.toggle('active', pick.t === 'barricade');
  ($('btn-end') as HTMLButtonElement).disabled = !human;

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
  <p><strong>The field.</strong> Three boards end to end: your homeland, the contested red-and-black middle, and the enemy homeland.</p>
  <p><strong>Your turn.</strong> Roll two dice. Each die is one action.${r.firstTurnOneDie ? ' Ivory rolls only one die on the very first turn.' : ''}${r.doubles === 'three' ? ' Doubles give you three actions.' : r.doubles === 'four' ? ' Doubles give you four actions.' : ''}${r.combineDice ? ' You can also spend both dice on one long move.' : ''} End your turn whenever you like.</p>
  <p><strong>Moving.</strong> ${range} Knights and kings move as in chess with any die. ${pawn}</p>
  ${
    r.combat === 'cards'
      ? `<p><strong>Attacking.</strong> Moving onto an enemy starts a fight. Each side adds its unit strength (pawn ${r.strength.P}, knight and bishop ${r.strength.N}, rook ${r.strength.R}, queen ${r.strength.Q}, king ${r.strength.K}), +${r.supportBonus} for each friendly neighbour (up to ${r.supportCap}), and a card. ${r.handSize ? `Attackers choose a card from a hand of ${r.handSize}; defenders draw blind.` : 'Both sides draw blind.'} Defenders get +${r.homeDefense} at home${r.barricades ? ` and +${r.fortBonus} beside their own barricade` : ''}. Higher total wins; ties go to the defender. A beaten attacker ${r.attackerLoss === 'repelled' ? 'stays where it was' : 'is captured'}.</p>`
      : '<p><strong>Attacking.</strong> Moving onto an enemy captures it, as in chess.</p>'
  }
  ${r.captureMode === 'jail' ? `<p><strong>Jail.</strong> Captured pieces go to jail. Spend a die of ${r.rescueMinDie} or more to bring one back to your home rows.</p>` : ''}
  ${r.promotionMode !== 'none' ? `<p><strong>Crossing.</strong> A pawn that reaches ${r.promotionZone === 'enemyHome' ? 'the enemy homeland' : 'the far edge'} ${r.promotionMode === 'reinforce' ? 'earns a new piece. Spend any die to deploy it on your home rows.' : r.promotionMode === 'promote' ? 'becomes a stronger piece.' : 'either becomes a stronger piece or earns one at home.'}</p>` : ''}
  ${r.barricades ? `<p><strong>Barricades.</strong> Spend a die to place one of your ${r.barricades} checkers next to your pieces (not in enemy land). They block movement. An adjacent enemy can knock one down with a ${r.demolishMinDie} or higher.</p>` : ''}
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
