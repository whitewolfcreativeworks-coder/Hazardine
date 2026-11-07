# Architecture

Hazardine is a small TypeScript codebase with no game engine dependency. One rules engine drives everything: the browser game, the computer opponents and the simulation lab.

```
src/engine/   Rules engine (pure logic, no DOM, deterministic)
  config.ts   Every rule variant as a setting, plus the current provisional defaults
  engine.ts   Board, setup, legal actions, combat, jail, rewards, barricades, victory
  rng.ts      Seeded random numbers (Mulberry32); dice and card shuffles both use it
src/ai/       Computer opponents
  agents.ts   Random, heuristic (eight personalities), Monte Carlo search
sim/          Simulation lab (Node)
  match.ts    Plays one match, summarises batches, computes the health score
  runner.ts   Runs batches in parallel child processes, one per CPU core
  variants.ts One-factor-at-a-time rule variants for sweeps
  cli.ts      npm run sim -- sweep | batch | tournament | skill
web/          Browser game (Vite, vanilla TypeScript, no framework)
tests/        Vitest tests for the engine
docs/         Rules, experiments and results
```

## Design decisions

- **Deterministic engine.** All randomness comes from a seeded generator stored in the game state. A seed plus a list of actions replays a game exactly, which makes bugs reproducible and experiments comparable.
- **One action per die.** The engine exposes `legalActions(state)` and `applyAction(state, action)`. Each action spends one die (or two, for a combined move). This keeps the interface identical for humans, bots and simulations.
- **Rules as data.** Every open design question in the spec is a field of `RuleConfig`. Experiments change config, not code. The UI reads the same config to explain the rules.
- **Compact state.** The board is an `Int8Array` of 192 squares, so cloning a state for AI lookahead is cheap.
- **No peeking.** The search bot reseeds the random generator in its rollouts, so it guesses future dice and cards rather than reading them.

## Dependencies

All development dependencies are open source:

| Package | License | Use |
|---|---|---|
| TypeScript | Apache-2.0 | Language |
| Vite | MIT | Dev server and build |
| vite-plugin-singlefile | MIT | Builds the game into one HTML file |
| Vitest | MIT | Tests |
| tsx | MIT | Runs the simulation lab |

The game has no runtime dependencies and needs no external AI service. Fonts (Alegreya SC, Alegreya Sans, SIL Open Font License) load from Google Fonts with system fallbacks.

### Frameworks considered

- **boardgame.io** (MIT): solid turn-based engine, but the project is in maintenance mode. Its bots are generic MCTS; ours need to understand dice and cards.
- **OpenSpiel** (DeepMind): strong research algorithms, including imperfect-information search. Heavy (C++/Python). A candidate later if we need a much stronger AI.
- **Ludii**: built for game design, but licensed CC BY-NC-ND (non-commercial, no derivatives), which conflicts with the commercial goal. Not used.
