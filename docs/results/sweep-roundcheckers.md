# Sweep round checkers

Self-play: 600 games per variant (heuristic vs heuristic, seats alternated). Skill edge: 300 games, a careful heuristic player vs a blundering one (same judgement, heavy noise); higher means better play wins more often, i.e. less luck.

| Variant | Health | First-player wins | Draws | Avg turns | Captures/game | Rescues | Rewards | Card-decided | Comebacks | Skill edge | Throne wins |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 checkers, no takeovers (current) | **88.8** | 49% | 0% | 54.7 | 12.9 | 4.3 | 2.1 | 27% | 71% | 82% | 8% |
| 12 checkers, takeovers, 4 in play | **88.3** | 48% | 0% | 53.5 | 12.2 | 4.1 | 2.0 | 26% | 70% | 84% | 8% |
| 6 checkers, takeovers | **86.9** | 53% | 0% | 68.0 | 17.2 | 7.7 | 1.3 | 31% | 73% | 77% | 6% |
| 12 checkers, takeovers, 6 in play | **84.7** | 56% | 0% | 69.8 | 17.0 | 7.8 | 1.3 | 31% | 70% | 77% | 6% |
| 12 checkers, takeovers, no cap | **63.1** | 45% | 30% | 129.4 | 5.7 | 2.2 | 0.9 | 27% | 33% | 50% | 15% |

## Checker detail

- 4 checkers, no takeovers (current): 9.7 placed, 0.0 taken over per game
- 12 checkers, takeovers, 4 in play: 9.3 placed, 1.8 taken over per game
- 6 checkers, takeovers: 14.9 placed, 1.7 taken over per game
- 12 checkers, takeovers, 6 in play: 15.2 placed, 6.7 taken over per game
- 12 checkers, takeovers, no cap: 28.1 placed, 5.0 taken over per game
