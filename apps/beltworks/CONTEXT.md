# Beltworks

The domain simulates 60 ticks per second. The browser draws the factory. Cloud catch-up uses the same simulation for up to one minute per absence.

## Workshop

The 2 × 2 Hub occupies columns 17 and 18 and rows 12 and 13. Buildings and belts are free. Each vein cell supports one extractor. The seed fixes the deposit locations. A locked ring hides its veins and rejects construction.

| Workshop | Size | Completed milestone | Expansion cost | New supply |
| --- | --- | --- | --- | --- |
| Starter | 12 × 10 | None | Free | One cell each of 1 and 2 |
| Ring 1 | 18 × 14 | 2 | 35 Sparks and 25 threes | 3 and 4 pairs, extra 1 and 2 |
| Ring 2 | 26 × 20 | 4 | 180 Sparks and 60 sevens | 5, 6 and 7 clusters, extra low numbers |
| Full Foundry | 36 × 26 | 6 | 650 Sparks, 120 twelves and 80 twenty-fours | 4, 5, 7, 8 and 9 clusters |

Clear floor removes buildings and cargo. The Vault, levels and milestone progress survive. Reset restores starter progression. Drag Erase to clear a rectangle. Undo restores the factory before an edit, including its cargo and progression. One belt drag is one edit. The browser keeps the last 25 edits until reset or reload. Local saves use `beltworks:save:v4`.

## Transport and production

A belt moves one item at a time. A splitter alternates left and right and uses an open port if the preferred port is blocked. A tunnel sends cargo to the first exit facing the same direction within five steps. Another entry facing the same direction blocks the link. The exit accepts cargo only through the tunnel. Combiners take A from the left and B from the right, relative to their output.

Speed upgrades open after M1. Across levels 1 to 15, the base belt speed increases from 1.5 to 12 cells/s, extraction from 1 to 8 items/s, and crafting from 1.3 to 10 recipes/s. Blocked output can reduce actual throughput. M2 opens the ten-level Hub amplifier (1× to 13× active delivery value). M3 opens the ten-level extractor surge. At level 2 each twelfth normal extraction earns one bonus item. At level 10 each third extraction does. The extractor retains that bonus until the output opens.

A purchase from level L costs 10 × L³ Sparks and 5 × L² units of the required stock. The stock values for levels 2 through 15 are 1, 3, 7, 7, 12, 12, 24, 24, 37, 37, 48, 48, 72 and 72. From level 5 the purchase also costs 10 × L ones. Purchases debit all costs together.

## Hub and Vault

The Vault keeps delivered 1, 3, 7, 12, 24, 37, 48, 72, 96 and 128. It also keeps any current mission or side contract target. Each tracked delivery earns one base Spark, or its amplified value for an active mission target. Foundry efficiency multiplies both production speed and delivery income. Fractional Sparks accumulate. The Vault shows each value's income during the last 3,600 ticks. Spending stock leaves the delivery counts intact.

| Mission | Quota | Minimum items/min | Reward |
| --- | --- | --- | --- |
| M1 | 15 × 1 | | Adder and speed upgrades |
| M2 | 35 × 3 | | Splitter, amplifier, Ring 1 and side contracts |
| M3 | 75 × 7 | | Tunnel and extractor surge |
| M4 | 140 × 12 | 25 | Multiplier and Ring 2 |
| M5 | 260 × 24 | 45 | Subtractor |
| M6 | 420 × 37 | 60 | Trash and Full Foundry |
| M7 | 500 × 48 and 300 × 12 | | +25% efficiency |
| M8 | 700 × 72 and 400 × 24 | 90 for 72 | +25% efficiency |
| M9 | 1,000 × 96 and 500 × 37 | 120 for 96 | +30% efficiency |

Each quota counts deliveries since the mission began. At completion, every quota and every rate gate must hold at the same time. From M10 the Hub asks for two values with rising quotas and rate gates. Each completion adds 15 percentage points to foundry efficiency.

One side contract is active when M3 starts. The seed and contract index select a value from 6, 9, 15, 18, 28, 3, 7 and 12. The quota ranges from 40 to 180. Completion awards eight Sparks per requested unit and adds one quarter of the quota to the Vault. The next delivery counts toward the new contract.
