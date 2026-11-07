# Sweep round 3

Self-play: 600 games per variant (heuristic vs heuristic, seats alternated). Skill edge: 120 games, search agent (lookahead) vs heuristic agent; higher means better play wins more often, i.e. less luck.

| Variant | Health | First-player wins | Draws | Avg turns | Captures/game | Rescues | Rewards | Card-decided | Comebacks | Skill edge | Throne wins |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E: separate dice only | **92.3** | 51% | 0% | 58.6 | 10.2 | 5.9 | 3.2 | 26% | 46% | 72% | 12% |
| A: combined dice | **91.2** | 54% | 1% | 46.0 | 8.2 | 3.6 | 2.8 | 25% | 47% | 75% | 11% |
| C: A + failed attacker captured | **88.6** | 56% | 1% | 44.9 | 8.0 | 3.3 | 2.7 | 19% | 49% | 75% | 10% |
| D: A + no extra doubles | **87.4** | 57% | 0% | 48.1 | 8.0 | 3.3 | 2.8 | 25% | 44% | 71% | 9% |
| B: A + full armies | **81.7** | 60% | 0% | 48.0 | 12.9 | 5.6 | 2.1 | 24% | 55% | 78% | 2% |
