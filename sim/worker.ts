/** Child process: runs a chunk of matches and sends results back to the parent. */
import { playMatch } from './match';
import type { Job } from './runner';

process.on('message', (jobs: Job[]) => {
  const results = jobs.map((j) => ({ ...playMatch(j.rules, j.first, j.second, j.seed), tag: j.tag }));
  process.send!(results, () => process.exit(0));
});
