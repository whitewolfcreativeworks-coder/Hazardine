/**
 * Hazardine simulation lab CLI.
 *
 *   npm run sim -- batch  [--rules '{"combat":"none"}'] [--a heuristic:balanced] [--b random] [--games 100]
 *   npm run sim -- sweep  [--games 120] [--skill 40] [--round 1]
 *   npm run sim -- tournament [--games 40]
 *   npm run sim -- skill  [--games 20]
 *
 * Results are written to docs/results/ as JSON plus a markdown table.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_RULES, type RuleConfig } from '../src/engine';
import { PERSONALITIES } from '../src/ai/agents';
import { runJobs, pairedJobs, type TaggedResult } from './runner';
import { summarize, health, type Summary } from './match';
import { VARIANTS, CANDIDATES, QUESTS, BATTLE, MUSTER, ORDER, CHECKERS } from './variants';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'batch';
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = new URL('../docs/results/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const pct = (x: number) => (x * 100).toFixed(0) + '%';
const f1 = (x: number) => x.toFixed(1);

function skillEdge(rs: TaggedResult[], strong: string): number {
  const dec = rs.filter((r) => r.winner !== null);
  return dec.length ? dec.filter((r) => r.winnerSpec === strong).length / dec.length : 0;
}

async function evaluateConfig(name: string, rules: Partial<RuleConfig>, games: number, skillGames: number, seed0 = 1) {
  const jobs = [
    ...pairedJobs(rules, 'heuristic:balanced', 'heuristic:balanced', games, seed0, 'self'),
    ...pairedJobs(rules, 'heuristic:balanced', 'novice', skillGames, seed0 + 50000, 'skill'),
  ];
  const rs = await runJobs(jobs);
  const self = summarize(rs.filter((r) => r.tag === 'self'));
  const edge = skillEdge(
    rs.filter((r) => r.tag === 'skill'),
    'heuristic:balanced',
  );
  const h = health(self, edge);
  return { name, rules, summary: self, skillEdge: edge, health: h };
}

type Row = Awaited<ReturnType<typeof evaluateConfig>>;

function questTable(rows: Row[]): string {
  return (
    '| Variant | Quest wins | Rooms cleared/game | Trials/game | Trials failed |\n|---|---|---|---|---|\n' +
    rows.map((r) => `| ${r.name} | ${pct(r.summary.questWinShare)} | ${f1(r.summary.questRoomsPerGame)} | ${f1(r.summary.trialsPerGame)} | ${pct(r.summary.trialFailRate)} |`).join('\n')
  );
}

function table(rows: Row[]): string {
  const head =
    '| Variant | Health | First-player wins | Draws | Avg turns | Captures/game | Rescues | Rewards | Card-decided | Comebacks | Skill edge | Throne wins |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  return (
    head +
    rows
      .map((r) => {
        const s = r.summary;
        return `| ${r.name} | **${r.health.score}** | ${pct(s.firstPlayerWinRate)} | ${pct(s.drawRate)} | ${f1(s.avgTurns)} | ${f1(s.capturesPerGame)} | ${f1(s.rescuesPerGame)} | ${f1(s.rewardsPerGame)} | ${pct(s.cardDecidedRate)} | ${pct(s.comebackRate)} | ${pct(r.skillEdge)} | ${pct(s.throneWinShare)} |`;
      })
      .join('\n')
  );
}

async function sweep() {
  const games = +opt('games', '120');
  const skill = +opt('skill', '40');
  const round = opt('round', '1');
  const base = opt('base', '');
  const baseRules: Partial<RuleConfig> = base ? JSON.parse(base) : {};
  const set = opt('set', 'variants');
  const variants = set === 'candidates' ? CANDIDATES() : set === 'quests' ? QUESTS() : set === 'battle' ? BATTLE() : set === 'muster' ? MUSTER() : set === 'order' ? ORDER() : set === 'checkers' ? CHECKERS() : VARIANTS(baseRules);
  const rows: Row[] = [];
  const t0 = Date.now();
  for (const [name, overrides] of Object.entries(variants)) {
    const rules = { ...baseRules, ...overrides };
    const row = await evaluateConfig(name, rules, games, skill);
    rows.push(row);
    console.log(`${name.padEnd(28)} health ${String(row.health.score).padStart(5)}  p0 ${pct(row.summary.firstPlayerWinRate)}  draws ${pct(row.summary.drawRate)}  turns ${f1(row.summary.avgTurns)}  skill ${pct(row.skillEdge)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  rows.sort((a, b) => b.health.score - a.health.score);
  writeFileSync(new URL(`sweep-round${round}.json`, OUT), JSON.stringify({ games, skill, baseRules, rows }, null, 2));
  writeFileSync(new URL(`sweep-round${round}.md`, OUT), `# Sweep round ${round}\n\nSelf-play: ${games} games per variant (heuristic vs heuristic, seats alternated). Skill edge: ${skill} games, a careful heuristic player vs a blundering one (same judgement, heavy noise); higher means better play wins more often, i.e. less luck.\n\n${table(rows)}\n${set === 'quests' ? '\n## Quest detail\n\n' + questTable(rows) + '\n' : ''}${set === 'checkers' ? '\n## Checker detail\n\n' + rows.map((r) => `- ${r.name}: ${f1(r.summary.barricadesPerGame)} placed, ${f1(r.summary.takeoversPerGame)} taken over per game`).join('\n') + '\n' : ''}${set === 'muster' || set === 'order' ? '\n## Musters per game\n\n' + rows.map((r) => `- ${r.name}: ${f1(r.summary.mustersPerGame)}`).join('\n') + '\n' : ''}`);
  console.log('\n' + table(rows));
}

async function batch() {
  const rules = JSON.parse(opt('rules', '{}'));
  const a = opt('a', 'heuristic:balanced');
  const b = opt('b', 'heuristic:balanced');
  const games = +opt('games', '100');
  const rs = await runJobs(pairedJobs(rules, a, b, games, +opt('seed', '1')));
  const s: Summary = summarize(rs);
  console.log(JSON.stringify(s, null, 2));
}

async function tournament() {
  const games = +opt('games', '40');
  const rules = JSON.parse(opt('rules', '{}'));
  const names = Object.keys(PERSONALITIES);
  const jobs = [];
  let seed = 9000;
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      jobs.push(...pairedJobs(rules, `heuristic:${names[i]}`, `heuristic:${names[j]}`, games, seed, `${names[i]}|${names[j]}`));
      seed += games;
    }
  const rs = await runJobs(jobs);
  const score: Record<string, { w: number; g: number }> = {};
  for (const n of names) score[n] = { w: 0, g: 0 };
  for (const r of rs) {
    const a = r.first.split(':')[1];
    const b = r.second.split(':')[1];
    score[a].g++;
    score[b].g++;
    if (r.winner === null) {
      score[a].w += 0.5;
      score[b].w += 0.5;
    } else score[r.winnerSpec!.split(':')[1]].w++;
  }
  const rows = names.map((n) => ({ n, rate: score[n].w / score[n].g })).sort((x, y) => y.rate - x.rate);
  const md = '| Strategy | Score |\n|---|---|\n' + rows.map((r) => `| ${r.n} | ${pct(r.rate)} |`).join('\n');
  writeFileSync(new URL('tournament.md', OUT), `# Strategy tournament\n\nRound robin, ${games} games per pairing (seats alternated). Rules: ${JSON.stringify(rules)} on top of defaults. Score = wins + half draws.\n\n${md}\n`);
  console.log(md);
}

async function skill() {
  const games = +opt('games', '20');
  const rules = JSON.parse(opt('rules', '{}'));
  const rs = await runJobs(pairedJobs(rules, 'search:balanced', 'heuristic:balanced', games, 7000));
  const edge = skillEdge(rs, 'search:balanced');
  const s = summarize(rs);
  const md = `# Skill ceiling\n\nSearch agent (Monte Carlo lookahead) vs heuristic agent, ${games} games, seats alternated.\n\n- Search agent win rate (decisive games): **${pct(edge)}**\n- Draws: ${pct(s.drawRate)}\n- Average length: ${f1(s.avgTurns)} turns\n`;
  writeFileSync(new URL('skill.md', OUT), md);
  console.log(md);
}

const commands: Record<string, () => Promise<void>> = { sweep, batch, tournament, skill };
(commands[cmd] ?? batch)().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { DEFAULT_RULES };
