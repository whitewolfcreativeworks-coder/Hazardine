# Hazardine

An original strategy game of armies crossing three connected boards. Chess pieces move, dice decide how many actions you get, cards settle fights, and captured pieces go to jail instead of leaving the game. The rules are being shaped by AI simulation and human playtesting.

> **Status:** experimental prototype. Every rule is provisional.

## Play

```bash
npm install
npm run dev      # opens the game at http://localhost:5173
npm run build    # builds a single self-contained file: dist/index.html
```

A narrated, chapter-by-chapter tutorial lives at `dist/tutorial/index.html` after building (`npm run tutorial` to work on it). Its narration is generated offline with Piper (`tools/narrate.py`), and `tools/record_tutorial.py` records it to an MP4.

The game runs in any modern browser and works with touch on iPad and phones. You can play against the computer, pass-and-play with a friend, or watch two computers play. The **How to play** button explains the rules currently in force.

Once GitHub Pages is switched on (Settings → Pages → Source: GitHub Actions), every push to `main` publishes the game automatically.

## The idea

- **Three boards, end to end:** your homeland (a chessboard), the contested middle (a red-and-black checkerboard) and the enemy homeland. 8 × 24 squares in all.
- **Dice give actions.** Roll two dice; each die is one action. Sliding pieces travel up to the die value, so the long field never lets a queen cross in one move.
- **Cards settle fights.** Attack and defence add unit strength, position bonuses and a card. Strong positions usually win, but not always.
- **Jail, not death.** Captured pieces can be rescued with a high die.
- **Crossing pays.** A pawn that reaches enemy land earns a new piece for your homeland.
- **Checkers are barricades.** Place them to block lanes and fortify defenders.

See [docs/RULES.md](docs/RULES.md) for the full provisional rules.

## The simulation lab

Every open design question is a setting in [`src/engine/config.ts`](src/engine/config.ts). The lab plays thousands of computer-vs-computer games to compare them:

```bash
npm run sim -- sweep --games 240 --skill 40   # test each rule variant against the baseline
npm run sim -- tournament --games 40          # do any strategies dominate?
npm run sim -- skill --games 40               # does better play beat worse play?
npm run sim -- batch --rules '{"combat":"none"}' --games 200
```

Results land in [`docs/results/`](docs/results/). What we've learned so far is in [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md). Simulation is a balancing instrument, not proof of fun; human playtesting decides.

## Development

```bash
npm test          # engine tests (Vitest)
npm run typecheck
```

Architecture, dependencies and the open-source options we evaluated are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
