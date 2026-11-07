/** Parallel match runner: splits jobs across child processes (one per CPU core). */
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RuleConfig } from '../src/engine';
import type { AgentSpec } from '../src/ai/agents';
import type { MatchResult } from './match';

export interface Job {
  rules: Partial<RuleConfig>;
  first: AgentSpec;
  second: AgentSpec;
  seed: number;
  tag?: string;
}
export type TaggedResult = MatchResult & { tag?: string };

const workerPath = fileURLToPath(new URL('./worker.ts', import.meta.url));

export async function runJobs(jobs: Job[], workers = Math.max(1, cpus().length)): Promise<TaggedResult[]> {
  const chunks: Job[][] = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => chunks[i % workers].push(j));
  const parts = await Promise.all(
    chunks
      .filter((c) => c.length)
      .map(
        (chunk) =>
          new Promise<TaggedResult[]>((resolve, reject) => {
            const child = fork(workerPath, [], { execArgv: ['--import', 'tsx'] });
            child.on('message', (m) => resolve(m as TaggedResult[]));
            child.on('error', reject);
            child.on('exit', (code) => code && reject(new Error(`worker exited ${code}`)));
            child.send(chunk);
          }),
      ),
  );
  return parts.flat();
}

/** Seat-balanced jobs: each seed is played twice with the agents swapping seats. */
export function pairedJobs(rules: Partial<RuleConfig>, a: AgentSpec, b: AgentSpec, games: number, seed0: number, tag?: string): Job[] {
  const jobs: Job[] = [];
  for (let i = 0; i < games; i++) {
    const seed = seed0 + Math.floor(i / 2);
    jobs.push(i % 2 === 0 ? { rules, first: a, second: b, seed, tag } : { rules, first: b, second: a, seed, tag });
  }
  return jobs;
}
