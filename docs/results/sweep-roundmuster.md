# Sweep round muster

Self-play: 600 games per variant (heuristic vs heuristic, seats alternated). Skill edge: 300 games, a careful heuristic player vs a blundering one (same judgement, heavy noise); higher means better play wins more often, i.e. less luck.

| Variant | Health | First-player wins | Draws | Avg turns | Captures/game | Rescues | Rewards | Card-decided | Comebacks | Skill edge | Throne wins |
|---|---|---|---|---|---|---|---|---|---|---|---|
| no muster (current) | **96.3** | 51% | 1% | 49.3 | 7.6 | 2.7 | 2.4 | 24% | 43% | 79% | 12% |
| muster once each, no queens (6 = rook) | **87.7** | 52% | 0% | 51.5 | 11.2 | 3.7 | 2.0 | 25% | 67% | 77% | 2% |
| muster once each, full armies | **83.8** | 46% | 0% | 48.3 | 14.9 | 4.3 | 1.1 | 20% | 68% | 72% | 0% |
| muster: each piece once | **82.5** | 52% | 0% | 41.9 | 8.6 | 2.2 | 1.5 | 21% | 64% | 67% | 4% |
| muster: every entry | **81.6** | 48% | 0% | 43.1 | 9.1 | 2.3 | 1.5 | 21% | 62% | 65% | 3% |
| muster: once per turn | **81.1** | 48% | 0% | 43.2 | 9.0 | 2.3 | 1.5 | 21% | 62% | 65% | 4% |
| muster once each, no pawn reward | **78.1** | 48% | 0% | 43.9 | 8.8 | 2.6 | 0.0 | 21% | 55% | 61% | 7% |

## Musters per game

- no muster (current): 0.0
- muster once each, no queens (6 = rook): 11.2
- muster once each, full armies: 9.5
- muster: each piece once: 9.9
- muster: every entry: 10.9
- muster: once per turn: 10.9
- muster once each, no pawn reward: 10.2
