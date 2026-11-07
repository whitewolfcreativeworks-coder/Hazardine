# Experiments log

What the simulation lab has found so far. Raw tables are in [results/](results/). Simulations measure balance, length, luck and strategy; they do not measure fun. Human playtesting decides.

## How we measure

- **Self-play:** two copies of the heuristic bot play each ruleset, swapping seats every game.
- **First-player wins:** share of decisive games won by Ivory. Target: close to 50%. At 600 games the margin of error is about ±4 points.
- **Card-decided:** share of fights where the card draw overturned what the base strengths predicted. Target: 10-35%, so luck matters but does not rule.
- **Skill edge:** a careful bot against a blundering copy of itself. Higher means good play beats bad play more reliably. The core game scores about 80%.
- **Comebacks:** share of games won by a player who trailed by 6+ material at some point.
- **Health score:** a weighted blend of all of the above (0-100). It is a balancing instrument for ranking variants, not a verdict.

## Round 1: one rule at a time (120 games each)

[Table](results/sweep-round1.md). Each variant changed one rule from a starting ruleset.

- **Pawn rewards are essential.** With no reward for crossing, games stalled: 45% draws, 227 turns on average.
- **Promotion in place is too strong.** Games ended in about 22 turns with few comebacks. Earning a reinforcement at home works better.
- **Unlimited sliding range breaks the long board.** Games shrink to about 31 turns. Capping range at the die value keeps the middle board meaningful.
- **Capture-and-rescue loops appeared.** Rescues nearly matched captures when rescue was cheap. Raising the rescue die to 6 cut this sharply.
- **Chess-style capture (no cards)** produced long games, more draws and a second-player edge.
- The skill column in this round compared a bot against random play (always 100%) and is not informative.

## Round 2: one rule at a time around the round 1 winners (240 games each)

[Table](results/sweep-round2.md). Base: no support bonus, rescue needs a 6, separate dice.

- **Full-scale cards (2-14) let cards decide 37% of fights**, against 26% for tiered values (1-5). Tiered stays.
- **The support bonus slowed games** (77 turns) and fed capture-rescue loops. It stays off.
- **Reaching the far back row to earn a reward** made rewards rare (0.6 per game) and pushed players toward throne rushes.
- **Correction:** the skill column in this round was inflated. The lookahead bot could see the order of the deck in its rollouts. That was fixed and the measure was replaced; later rounds are clean.

## Round 3: head-to-head candidate rulesets (600 games each, 300 skill games)

[Table](results/sweep-round3.md).

| Ruleset | Health | First-player wins | Avg turns | Skill edge |
|---|---|---|---|---|
| **A1: combined dice + one-die opening** | **94.6** | **52%** | 45 | 80% |
| C1: A1 + failed attacker captured | 92.5 | 52% | 46 | 80% |
| B1: A1 + full chess armies | 91.4 | 50% | 48 | 79% |
| A: combined dice | 91.3 | 54% | 46 | 78% |
| E1: A1 with separate dice only | 90.2 | 55% | 57 | 86% |

**Adopted: A1** (see RULES.md). The first player consistently won 54-57% until the opening turn was limited to one die. Full armies are a close, viable alternative with more captures and no throne wins. Separate dice give the highest skill edge (86%) at the cost of longer games and a bigger first-player edge. That trade-off is worth testing with people.

## Strategy tournament (core game)

[Table](results/tournament-core.md). Round robin between eight bot personalities, 40 games per pairing.

Throne rushers (73%) and aggressive players (72%) lead, balanced play is close (67%), and defensive turtling (18%) and pawn-pushing for rewards (2%) lose badly. No single strategy dominates, but the throne is a strong target. Watch for this in playtests; if rushing feels oppressive, the throne victory could need a condition such as holding it for a full turn.

## Quest mode ("two dungeons") (400 games each, 200 skill games)

[Table](results/sweep-roundquests.md). Each side clears three mirrored rooms with card trials (see RULES.md).

| Variant | First-player wins | Quest wins | Rooms cleared/game | Trials failed | Skill edge |
|---|---|---|---|---|---|
| Quests off | 50% | — | — | — | 80% |
| Boons only | 50% | — | 2.8 | 8% | 69% |
| Boons, linked | 52% | — | 3.0 | 9% | 69% |
| Completing it wins | 41% | 59% | 3.0 | 21% | 68% |
| Wins, linked | 44% | 61% | 3.0 | 19% | 68% |
| Wins, easier rooms | 59% | 76% | 3.6 | 36% | 63% |
| Wins, harder rooms | 48% | 48% | 2.8 | 20% | 61% |

What it shows:

- **The mechanics work.** Both quests progress every game, the two dungeons collide in the middle, and games stay about the same length.
- **"Completing it wins" takes over.** About 60% of games end by quest rather than by king or throne, so the quest becomes the main game rather than a side story.
- **Quests add luck.** Skill edge drops from 80% to 61-69%, because trials are card draws.
- **The quest race favours the second player** (41% first-player wins). Without the one-die opening it is 46%. Quest mode should drop that handicap.
- **Boons only is the gentlest version.** It stays balanced (50%) and keeps the core game in charge. But trials are rarely failed (8%), so they work more like a detour than a danger.
- **Linking made little difference** at +1.

**Recommendation for playtesting:** start with *boons only*, two dice on the opening turn, and harder trials, so the dungeon is a real risk with a real reward. Then try *completing it wins* with harder rooms if the group wants the quest to be a second path to victory. In the strategy tournament with quests on, the dedicated quester bot scored only 52%, so chasing the quest alone is not a dominant plan ([table](results/tournament-quest.md)).

### Open ideas for the quest

- **Cooperative pressure** ("both sides help"): a shared threat, such as a dungeon boss that wakes when either side clears the Crypt and attacks whichever army is weaker. Not yet built.
- **Secret quests:** each player draws one of several quest cards with different rooms, so opponents must guess where you are heading.
- **Spells from the dungeon:** the Shield boon is already the spec's Shield spell. Teleport and Release could be the other two boons.
