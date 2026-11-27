# Beltworks

The domain runs the factory at 60 ticks per second. It owns commands, events, progression, and saved state. The browser draws the board and controls frame timing.

## Workshop

Buildings and belts are free. An extractor must stand on a vein. The seed determines vein positions. Each cell of a cluster can support its own extractor.

| Workshop | Size | Cost | New veins |
| --- | --- | --- | --- |
| Starter | 12 × 10 | Free | One cell each of 1 and 2 |
| Ring 1 | 18 × 14 | 35 Sparks | Two cells each of 3 and 4, one cell of 2 |
| Full floor | 24 × 18 | 120 Sparks | Three cells each of 5 and 7, two cells each of 6 and 1 |

Speed upgrades open after milestone 1. Ring 1 opens after milestone 2. Ring 2 opens after milestone 4. Locked rings hide their veins and reject placement. Reset removes player buildings and cargo and restores starter progression. Clear floor removes buildings and cargo and keeps progression. Drag Erase to clear a rectangle. The Hub and vein positions stay fixed. Undo (Ctrl+Z or Cmd+Z) restores the factory before an edit, including its cargo and progression. One belt drag counts as one edit. The browser keeps the last 25 edits until reset or reload.

## Transport and production

- A belt advances an item by 25 times the belt speed level each tick. One cell takes 1,000 units. Cargo waits when the next cell cannot accept it.
- A splitter alternates between left and right. It uses the open port when the preferred port is blocked.
- A tunnel entry sends cargo to the first exit facing the same direction within five steps. Another entry facing the same direction blocks the link. Cargo waits for an open exit. The exit accepts cargo only through the tunnel and sends it forward on the surface.
- An extractor takes 60 ticks divided by its speed level per item. A combiner takes 45 ticks divided by its speed level per recipe. Round both periods up. A combiner takes A from its left and B from its right, relative to its output.
- Rotation turns a building clockwise. Each speed starts at level 1 and can reach level 5. A level costs 10 times the square of the current level in Sparks.

## Milestones

The Hub consumes every delivery. A matching number counts toward the quota and earns its value in Sparks. The rate counts only matching deliveries in the last 3,600 ticks of the current milestone. Completing a milestone clears that history.

| Milestone | Target | Quota | Reward |
| --- | --- | --- | --- |
| 1 | 1 | 12 | Adder (+) & Speed Upgrades |
| 2 | 3 | 20 | Splitter & Ring 1 Expansion |
| 3 | 7 | 35 | Underground Tunnel |
| 4 | 12 | 50 | Multiplier (×) & Full Floor |
| 5 | 24 | 75 | Subtractor (−) |
| 6 | 37 | 100 | Trash |

Later targets are 48, 64, 99, and 128, then increase by 32. Quotas start at 120 for milestone 7 and increase by 20 per milestone.
