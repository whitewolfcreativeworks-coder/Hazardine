# Hazardine: provisional rules (v0.1)

Everything here is provisional. These are the simplest rules that make a complete, playable match, tuned with the simulation lab. Each rule maps to a setting in [`src/engine/config.ts`](../src/engine/config.ts); the alternatives tested are listed at the end. The creator decides what becomes final.

## Components

Two chessboards and one checkerboard laid end to end (8 × 24 squares), pieces from four chess sets (two sets per player), two sets of checkers, one 52-card deck, two six-sided dice.

## The field

- **Rows 1-8:** Ivory's homeland (chessboard).
- **Rows 9-16:** the contested middle (red-and-black checkerboard).
- **Rows 17-24:** Ebony's homeland (chessboard).

Each king starts on its **throne**: the e-file square of its back row.

## Setup

Each player starts with a small army and keeps the rest of their two chess sets in reserve:

- Back row: knight (b), bishop (c), king (e), rook (g).
- Second row: six pawns (b-g).
- Shuffle the deck. Each player draws a hand of 3 cards.
- Each player takes 4 checkers as barricades.

Ivory moves first, but rolls only **one die** on the opening turn (this offsets the first-player advantage).

## A turn

1. Roll both dice. Each die is **one action**. Doubles give **three** actions of that value.
2. Spend dice one at a time, in any order, on any of the actions below. You may also spend both dice together on a single move whose range is their sum.
3. End your turn when your dice are spent, or earlier if you choose.

## Actions

**Move.** Kings and knights move as in chess with any die. Queens, rooks and bishops move as in chess but no farther than the die value. Pawns move straight forward up to half the die value (rounded up) and attack one square diagonally forward. Nothing jumps over pieces or barricades except knights.

**Attack.** Move onto an enemy piece to fight it:

- Each side's strength: pawn 2, knight 4, bishop 4, rook 6, queen 9, king 5.
- The defender adds +1 in its own homeland and +2 if it stands next to one of its own barricades.
- The attacker plays a card from its hand (then draws a replacement); the defender draws one blind from the deck.
- Card values: 2-4 = +1, 5-7 = +2, 8-10 = +3, J-Q = +4, K-A = +5.
- Higher total wins. **Ties go to the defender.** A beaten attacker stays where it was. A beaten defender goes to jail and the attacker takes its square.

**Rescue.** Spend a **6** to return one of your jailed pieces to any empty square on your back two rows.

**Barricade.** Spend any die to place one of your checkers on an empty square next to one of your pieces, in your homeland or the middle. Barricades block movement for both sides. An enemy piece next to a barricade can knock it down with a die of 4 or more.

**Deploy.** Spend any die to place an earned reinforcement on an empty square in your back two rows.

## Crossing the field

When a pawn first enters the enemy homeland, choose a queen, rook, bishop or knight from your reserve. It is **earned**: deploy it at home with a later action. The pawn stays where it is and cannot earn again. Reserves are finite (two sets per player), which caps how many reinforcements anyone can earn.

## Winning

- Capture the enemy king, **or**
- Move any piece onto the enemy throne.

If 300 player-turns pass without a winner, the game is a draw (this has not happened in recent simulations).

## Alternatives tested

| Question | Options tested | Current choice | Why (see EXPERIMENTS.md) |
|---|---|---|---|
| Starting army | full, reduced, full with pawns forward | reduced | Faster start; full armies remain a strong option |
| Sliding range | die value, unlimited | die value | Unlimited makes games very short and swingy |
| Pawn step | one square, half the die | half the die | One square drags games out and raises draws |
| Combined dice | yes, no | yes | Shorter, more balanced games; separate dice slightly raise the skill edge |
| Doubles | none, three actions, four actions | three | Within noise; three adds a moment of excitement |
| Opening turn | two dice, one die | one die | First player won 54-57% without it, 52% with it |
| Combat | cards, chess-style capture | cards | Chess capture lengthens games and favours the second player |
| Card scale | full 2-14, tiered 1-5 | tiered | Full scale lets cards decide too many fights |
| Hand | blind draw, hand of 3 | hand of 3 | Similar numbers; a hand adds a decision |
| Failed attacker | stays, captured | stays | Within noise |
| Support bonus | none, +1 per neighbour | none | The bonus slowed games and fed capture-rescue loops |
| Captured pieces | jail, removed | jail | Keeps recovery decisions; removed is a strong simpler option |
| Rescue die | 3+, 5+, 6+ | 6 | Lower thresholds create capture-rescue loops |
| Pawn reward | promote, reinforce, choice, none | reinforce | No reward → long games and draws; promote → too short, no comebacks |
| Reward zone | enemy homeland, far back row | enemy homeland | Back row makes rewards rare |
| Barricades | 0, 4 | 4 | Small effect; gives checkers a job |
| Victory | king, king or throne | king or throne | Second path adds tension at little cost |

## Optional: Quest mode

Each side runs its own three-room dungeon on the battlefield, tracked with pencil on the [printable quest sheet](../web/public/quest-sheet.html). See EXPERIMENTS.md for how the variants played in simulation.

- **Rooms.** Ivory: the Ford (b11 or g11), the Crypt (c14 or f14), the Vault (a20 or h20). Ebony's are the mirror image (b14/g14, c11/f11, a5/h5). Rooms must be cleared in order.
- **Trial.** When one of your pieces other than the king ends a move on your next room, draw a card from the deck. Strength + card value must reach 7, 9 and 11 for the three rooms.
- **Pass.** Mark the room. Ford: take a rook, bishop or knight from reserve to deploy at home. Crypt: gain a shield (spend it to turn a lost defence into a repelled attack). Vault: the quest is complete.
- **Fail.** The piece goes to jail; the room stays open.
- **Variants.** *Quest wins*: completing the Vault wins the game. *Boons only*: the Vault grants a queen and frees one prisoner instead. *Linked*: each room your rival clears makes your next trial 1 easier.
