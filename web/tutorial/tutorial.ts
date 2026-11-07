import '../style.css';
import './tutorial.css';
import {
  createGame,
  applyAction,
  isOver,
  decode,
  rowOf,
  colOf,
  territoryOf,
  throneOf,
  questRooms,
  cardLabel,
  cardValue,
  isRed,
  SQUARES,
  type GameState,
  type Player,
  type Kind,
} from '../../src/engine';
import { makeAgent } from '../../src/ai/agents';
import { CHAPTERS, LINES, LIVE_GAME, type Stage, type Focus, type Chapter } from './script';
import narrationData from './narration.json';

const narration = narrationData as Record<string, { dur: number; src: string }>;
const GLYPH: Record<Kind, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const KIND_NAME: Record<Kind, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const SIDE = ['Ivory', 'Ebony'];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const params = new URLSearchParams(location.search);
const RECORD = params.has('record');
const marks: { id: string; t: number }[] = [];
(window as unknown as { __marks: typeof marks }).__marks = marks;

// ---------- playback control ----------

class Cancelled extends Error {}
let token = { cancelled: false };
let paused = false;
let voiceOn = true;
const audio = new Audio();

function wait(ms: number): Promise<void> {
  const my = token;
  return new Promise((resolve, reject) => {
    let left = ms;
    let last = performance.now();
    const tick = () => {
      if (my.cancelled) return reject(new Cancelled());
      const now = performance.now();
      if (!paused) left -= now - last;
      last = now;
      if (left <= 0) resolve();
      else setTimeout(tick, Math.min(50, Math.max(5, left)));
    };
    setTimeout(tick, Math.min(50, ms));
  });
}

function estimate(text: string) {
  return text.split(/\s+/).length * 0.37 + 0.6;
}

// ---------- board rendering ----------

let current: GameState;
let focus: Focus = {};
let chapterIndex = 0;

function cellPos(s: number) {
  return { x: rowOf(s) + 1, y: 8 - colOf(s) };
}

function renderBoard() {
  const s = current;
  const board = $('board');
  board.style.gridTemplateColumns = 'repeat(24, 1fr)';
  board.style.gridTemplateRows = 'repeat(8, 1fr)';
  const frag = document.createDocumentFragment();
  const thrones = [throneOf(0), throneOf(1)];
  const spot = new Set(focus.squares ?? []);
  const tgt = new Set(focus.targets ?? []);
  const atk = new Set(focus.attacks ?? []);
  const rooms: [number, Player][] = [];
  if (focus.allRooms) for (let st = 0; st < 3; st++) for (const r of questRooms(0, st)) rooms.push([r, 0]);
  else if (s.rules.quest !== 'off') for (const q of [0, 1] as Player[]) for (const r of questRooms(q, s.questStage[q])) rooms.push([r, q]);
  for (let i = 0; i < SQUARES; i++) {
    const cell = document.createElement('div');
    const { x, y } = cellPos(i);
    cell.style.gridColumn = String(x);
    cell.style.gridRow = String(y);
    cell.dataset.sq = String(i);
    const terr = territoryOf(i);
    const dark = (rowOf(i) + colOf(i)) % 2 === 0;
    cell.className = `sq ${terr === 1 ? (dark ? 'mid-dark' : 'mid-light') : dark ? 'home-dark' : 'home-light'}`;
    if (thrones.includes(i)) cell.classList.add('throne');
    if (focus.territory != null && terr !== focus.territory) cell.classList.add('dimmed');
    if (spot.has(i)) cell.classList.add('spot');
    if (tgt.has(i)) cell.classList.add('target');
    if (atk.has(i)) cell.classList.add('target-attack');
    for (const [r, q] of rooms) {
      if (r === i) {
        const m = document.createElement('span');
        m.className = `room room-${q}`;
        cell.append(m);
      }
    }
    if (s.barricade[i] !== -1) {
      const b = document.createElement('span');
      b.className = `barricade side-${s.barricade[i]}`;
      cell.append(b);
    }
    const p = decode(s.board[i]);
    if (p) {
      const g = document.createElement('span');
      g.className = `glyph side-${p.owner}${p.veteran ? ' veteran' : ''}`;
      g.textContent = GLYPH[p.kind];
      cell.append(g);
    }
    frag.append(cell);
  }
  board.replaceChildren(frag);
}

const PIP_LAYOUT: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function die(v: number, spent: boolean) {
  const d = document.createElement('span');
  d.className = `die${spent ? ' spent' : ''}`;
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('i');
    if (PIP_LAYOUT[v].includes(i)) pip.className = 'pip';
    d.append(pip);
  }
  return d;
}
function cardHtml(c: number, cls = '') {
  return `<span class="card ${isRed(c) ? 'red' : 'black'} ${cls}"><b>${cardLabel(c)}</b><small>+${cardValue(c, current.rules)}</small></span>`;
}

function renderPanels() {
  const s = current;
  const p = s.toMove;
  $('turn-label').innerHTML = isOver(s)
    ? `<span class="glyph side-${s.winner ?? 0}">♚</span> ${s.draw ? 'Draw' : SIDE[s.winner!] + ' wins'}`
    : `<span class="glyph side-${p}">♚</span> ${SIDE[p]} to play`;
  const dice = $('dice');
  dice.replaceChildren();
  const remaining = s.dice.slice();
  for (const v of s.rolled) {
    const i = remaining.indexOf(v);
    if (i >= 0) remaining.splice(i, 1);
    dice.append(die(v, i < 0));
  }

  const mid = $('p-mid');
  const lc = s.lastCombat;
  const lt = s.lastTrial;
  if (lc) {
    mid.className = 'panel panel-mid fight';
    const row = (side: Player, k: Kind, base: number, card: number, total: number) =>
      `<div class="combat-row"><span class="glyph side-${side}">${GLYPH[k]}</span><span>${base}</span><span>+</span>${cardHtml(card)}<span>=</span><strong>${total}</strong></div>`;
    mid.innerHTML =
      row(lc.attacker, lc.attackerKind, lc.attackBase, lc.attackCard, lc.attackTotal) +
      row((1 - lc.attacker) as Player, lc.defenderKind, lc.defenseBase, lc.defenseCard, lc.defenseTotal) +
      `<p class="verdict">${lc.attackerWon ? (lc.defenderKind === 'K' ? 'The king falls.' : `${KIND_NAME[lc.defenderKind]} captured.`) : 'Attack repelled.'}</p>`;
  } else if (lt) {
    mid.className = 'panel panel-mid fight';
    mid.innerHTML = `<div class="combat-row"><span class="glyph side-${lt.player}">${GLYPH[lt.kind]}</span><span>${lt.strength}</span><span>+</span>${cardHtml(lt.card)}<span>=</span><strong>${lt.total}</strong><span class="needs">needs ${lt.target}</span></div><p class="verdict">${lt.passed ? `Room cleared: ${lt.boon}.` : 'The dungeon takes the piece.'}</p>`;
  } else if (s.hands[p].length && s.rules.handSize && chapterIndex >= 3) {
    mid.className = 'panel panel-mid';
    mid.innerHTML = `<h3>${SIDE[p]}'s hand</h3><div class="hand">${s.hands[p].map((c) => cardHtml(c)).join('')}</div>`;
  } else {
    mid.className = 'panel panel-mid empty';
    mid.innerHTML = '';
  }

  const camps = $('p-camps');
  camps.innerHTML = ([0, 1] as Player[])
    .map((q) => {
      const jail = s.jail[q].map((k) => `<span class="mini glyph side-${q}">${GLYPH[k]}</span>`).join('') || '<span class="muted">none</span>';
      const ready = s.ready[q].map((k) => `<span class="mini glyph side-${q} can">${GLYPH[k]}</span>`).join('') || '<span class="muted">none</span>';
      const quest =
        s.rules.quest !== 'off'
          ? `<div class="camp-line"><span class="camp-title">Quest</span><span class="camp-list">${['Ford', 'Crypt', 'Vault'].map((n, i) => `<span class="step${i < s.questStage[q] ? ' done' : i === s.questStage[q] ? ' next' : ''}">${n}</span>`).join('')}</span></div>`
          : '';
      return `<div class="camp"><h3><span class="glyph side-${q}">♚</span> ${SIDE[q]}</h3>${quest}<div class="camp-line"><span class="camp-title">In jail</span><span class="camp-list">${jail}</span></div><div class="camp-line"><span class="camp-title">Earned</span><span class="camp-list">${ready}</span></div></div>`;
    })
    .join('');
}

function render() {
  renderBoard();
  renderPanels();
}

function cellEl(i: number) {
  return document.querySelector(`#board [data-sq="${i}"]`) as HTMLElement;
}

/** Board-relative centre of a square, in unscaled stage pixels. */
function centre(i: number) {
  const el = cellEl(i);
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth };
}

function flyGlyph(text: string, side: number, from: number, to: number, frac = 1, ms = 650): Promise<void> {
  const a = centre(from);
  const b = centre(to);
  const g = document.createElement('span');
  g.className = `glyph side-${side} flyer`;
  g.textContent = text;
  g.style.fontSize = `${a.w * 0.78}px`;
  g.style.left = `${a.x}px`;
  g.style.top = `${a.y}px`;
  $('fx').append(g);
  const origin = cellEl(from).querySelector('.glyph') as HTMLElement | null;
  if (origin) origin.style.visibility = 'hidden';
  const anim = g.animate(
    [{ transform: 'translate(-50%, -50%)' }, { transform: `translate(calc(-50% + ${(b.x - a.x) * frac}px), calc(-50% + ${(b.y - a.y) * frac}px))` }],
    { duration: ms, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' },
  );
  return anim.finished.then(() => {
    g.remove();
  });
}

function pop(i: number) {
  const el = cellEl(i);
  el?.querySelector('.glyph, .barricade')?.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out' });
  el?.classList.add('flash');
}

// ---------- the stage API used by the script ----------

const stage: Stage = {
  show(s) {
    current = s;
    focus = {};
    render();
  },
  async say(id) {
    const text = LINES[id];
    const n = narration[id];
    $('caption-text').textContent = text;
    $('caption').classList.add('on');
    marks.push({ id, t: performance.now() });
    const dur = n ? n.dur : estimate(text);
    if (n && voiceOn && !RECORD) {
      audio.src = n.src;
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
    }
    try {
      await wait(dur * 1000 + 350);
    } finally {
      if (token.cancelled) audio.pause();
    }
  },
  wait,
  async play(s, a) {
    current = s;
    focus = {};
    const mover = s.toMove;
    if (a.t === 'move') {
      const piece = decode(s.board[a.from])!;
      const attack = !!s.board[a.to];
      if (attack) {
        await flyGlyph(GLYPH[piece.kind], piece.owner, a.from, a.to, 0.55, 420);
        applyAction(s, a);
        render();
        cellEl(a.to).classList.add('flash');
        await wait(1300);
      } else {
        await flyGlyph(GLYPH[piece.kind], piece.owner, a.from, a.to);
        applyAction(s, a);
        render();
        if (s.lastTrial) {
          cellEl(a.to).classList.add('flash');
          await wait(1300);
        }
      }
    } else if (a.t === 'end') {
      applyAction(s, a);
      render();
    } else {
      applyAction(s, a);
      render();
      pop(a.to);
      await wait(500);
    }
    void mover;
  },
  focus(f) {
    focus = f;
    renderBoard();
  },
  note(text) {
    const n = $('note');
    n.hidden = !text;
    n.textContent = text ?? '';
  },
};

// ---------- the closing live game ----------

async function liveGame() {
  const s = createGame(LIVE_GAME.seed, {}, { log: true });
  const agents = [makeAgent(LIVE_GAME.ivory, LIVE_GAME.seed * 2 + 1), makeAgent(LIVE_GAME.ebony, LIVE_GAME.seed * 2 + 2)];
  stage.show(s);
  await stage.say('live1');
  $('caption-text').textContent = 'Ivory (aggressive) against Ebony (balanced). Fights, rescues and crossings appear as they happen.';
  let guard = 0;
  while (!isOver(s) && guard++ < 2000) {
    const a = agents[s.toMove].choose(s);
    if (a.t === 'move') {
      const piece = decode(s.board[a.from])!;
      const attack = !!s.board[a.to];
      await flyGlyph(GLYPH[piece.kind], piece.owner, a.from, a.to, attack ? 0.55 : 1, attack ? 260 : 300);
      applyAction(s, a);
      render();
      if (s.lastCombat || s.lastTrial) {
        cellEl(a.to).classList.add('flash');
        await wait(s.lastCombat?.defenderKind === 'K' && s.lastCombat.attackerWon ? 2400 : 900);
      } else await wait(90);
    } else {
      applyAction(s, a);
      render();
      if (a.t !== 'end') {
        pop(a.to);
        await wait(380);
      } else await wait(160);
    }
  }
  await wait(600);
  await stage.say('live2');
  await stage.say('outro');
}

// ---------- chapters & transport ----------

const ALL: Chapter[] = [...CHAPTERS, { id: 'live', title: 'A real game', run: liveGame }];

async function titleCard(i: number) {
  const card = $('title-card');
  $('title-card-num').textContent = `Chapter ${i + 1}`;
  $('title-card-text').textContent = ALL[i].title;
  card.hidden = false;
  card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
  await wait(1500);
  await card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
  card.hidden = true;
}

async function runFrom(i: number) {
  token.cancelled = true;
  audio.pause();
  token = { cancelled: false };
  const my = token;
  try {
    for (let c = i; c < ALL.length; c++) {
      chapterIndex = c;
      updateChrome();
      $('caption').classList.remove('on');
      stage.note(null);
      await titleCard(c);
      await ALL[c].run(stage);
      await wait(700);
    }
    if (my === token) {
      $('caption-text').textContent = 'The end. Choose a chapter to watch it again.';
      (window as unknown as { __done: boolean }).__done = true;
      setPaused(true);
    }
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e;
  }
}

function updateChrome() {
  $('chapter-title').textContent = ALL[chapterIndex].title;
  $('chapter-count').textContent = `${chapterIndex + 1} of ${ALL.length}`;
  document.querySelectorAll('#chapters li').forEach((li, i) => li.classList.toggle('current', i === chapterIndex));
}

function setPaused(v: boolean) {
  paused = v;
  $('btn-play').textContent = v ? 'Play' : 'Pause';
  if (v) audio.pause();
  else if (voiceOn && audio.src && !audio.ended && audio.currentTime > 0) audio.play().catch(() => undefined);
}

function buildChapterList() {
  const list = $('chapters');
  list.innerHTML = '';
  ALL.forEach((c, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.title;
    b.onclick = () => start(i);
    li.append(b);
    list.append(li);
  });
}

let started = false;
function start(i = 0) {
  started = true;
  $('start').hidden = true;
  setPaused(false);
  void runFrom(i);
}

function fit() {
  const frame = $('frame');
  const k = frame.clientWidth / 1280;
  $('stage').style.transform = `scale(${k})`;
  frame.style.height = `${720 * k}px`;
}

// ---------- wiring ----------

buildChapterList();
window.addEventListener('resize', fit);
fit();
current = createGame(11, {});
current.dice = [];
current.rolled = [];
chapterIndex = 0;
render();
updateChrome();

$('start').onclick = () => start(0);
$('btn-play').onclick = () => (started ? setPaused(!paused) : start(0));
$('btn-next').onclick = () => start(Math.min(ALL.length - 1, chapterIndex + 1));
$('btn-prev').onclick = () => start(Math.max(0, chapterIndex - 1));
($('opt-voice') as HTMLInputElement).onchange = (e) => {
  voiceOn = (e.target as HTMLInputElement).checked;
  if (!voiceOn) audio.pause();
};

if (RECORD) {
  document.body.classList.add('recording');
  start(0);
}
