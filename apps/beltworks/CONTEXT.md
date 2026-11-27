# Beltworks

The domain simulates 60 ticks per second. The browser draws the factory. Cloud catch-up uses the same simulation for up to one minute per absence.

## Workshop

The 2 × 2 Hub occupies columns 17 and 18 and rows 12 and 13. Buildings and belts are free. Each vein cell supports one extractor. The seed fixes the deposit locations. A locked ring hides its veins and rejects construction.

| Workshop | Size | Completed milestone | Expansion cost | New supply |
| --- | --- | --- | --- | --- |
| Starter | 12 × 10 | None | Free | One cell each of 1 and 2 |
| Ring 1 | 18 × 14 | 2 | 35 Sparks and 15 threes | 3 and 4 pairs, extra 1 and 2 |
| Ring 2 | 26 × 20 | 4 | 180 Sparks and 60 sevens | 5, 6 and 7 clusters, extra low numbers |
| Full Foundry | 36 × 26 | 6 | 650 Sparks, 120 twelves and 80 twenty-fours | 4, 5, 7, 8 and 9 clusters |

Clear floor removes buildings and cargo. The Vault, levels and milestone progress survive. Reset restores starter progression. Drag Erase to clear a rectangle. Undo restores the factory before an edit, including its cargo and progression. One belt drag is one edit. The browser keeps the last 25 edits until reset or reload. Local saves use `beltworks:save:v7`. The game can load v5 and v6 saves.

## Transport and production

A belt moves one item at a time. A splitter alternates left and right and uses an open port if the preferred port is blocked. A belt junction takes one item from the left, rear or right. Each successful transfer moves priority to the next port. A buffer silo accepts up to 24 items of one value through any side except the front. After a successful transfer it waits one belt interval before releasing another item, including into the Hub. An empty silo can accept a new value. A tunnel sends cargo to the first exit facing the same direction within five steps. Another entry facing the same direction blocks the link. The exit accepts cargo only through the tunnel. Combiners take A from the left and B from the right, relative to their output.

The divider returns the integer part of A divided by B. A zero divisor produces zero. A filter accepts cargo from the rear. A matching number goes straight. Other numbers turn right, or left if the right port cannot accept the item. A new filter uses the primary mission target. Select a filter or press F over it to set a value from 1 to 999.

A beacon accepts fuel from all four sides. Each item worth at least two adds 45 ticks of fuel per unit, up to 1,800 ticks. The beacon uses one tick of fuel per simulation tick. A fueled beacon increases extractor and combiner speed by 50% within two cells, including diagonals. The combined bonus stops at 100%.

Speed upgrades open after M1. Across levels 1 to 15, the base belt speed increases from 1.5 to 12 cells/s, extraction from 1 to 8 items/s, and crafting from 1.3 to 10 recipes/s. Blocked output can reduce actual throughput. M2 opens the ten-level Hub amplifier (1× to 13× active delivery value). M3 opens the ten-level extractor surge. At level 2 each twelfth normal extraction earns one bonus item. At level 10 each third extraction does. The extractor retains that bonus until the output opens.

A purchase from level L costs 10 × L³ Sparks and 5 × L² units of the required stock. The stock values for levels 2 through 15 are 1, 3, 7, 7, 12, 12, 24, 24, 37, 37, 48, 48, 72 and 72. From level 5 the purchase also costs 10 × L ones. Purchases debit all costs together.

## Hub and Vault

The Vault keeps delivered 1, 3, 7, 12, 24, 37, 48, 72, 96 and 128. It also keeps any current mission or side contract target. Each tracked delivery earns one base Spark, or its amplified value for an active mission target. Foundry efficiency multiplies both production speed and delivery income. Fractional Sparks accumulate. The Vault shows each value's income during the last 3,600 ticks. Spending stock leaves the delivery counts intact.

| Mission | Quota | Minimum items/min | Reward |
| --- | --- | --- | --- |
| M1 | 8 × 1 | | Adder and speed upgrades |
| M2 | 18 × 3 | | Splitter, amplifier and Ring 1 |
| M3 | 75 × 7 | | Tunnel, extractor surge and side contracts |
| M4 | 140 × 12 | 25 | Multiplier and Ring 2 |
| M5 | 260 × 24 | 45 | Smart number filter and buffer silo |
| M6 | 420 × 37 | 60 | Subtractor, trash and Full Foundry |
| M7 | 500 × 48 and 300 × 12 | 30 and 35 | Overclock beacon and +25% efficiency |
| M8 | 700 × 72 and 400 × 24 | 90 and 45 | Divider, ascension and +25% efficiency |
| M9 | 1,000 × 96 and 500 × 37 | 120 and 60 | +30% efficiency |

M1 through M5 award 12, 25, 50, 100 and 150 bonus Sparks. Each later milestone awards 50 more Sparks than the previous milestone. The bonus is fixed across mutators and upgrades.

Each quota counts deliveries since the mission began. At completion, every quota and every rate gate must hold at the same time. Removing a building restarts both mission rate counts. Quotas and Vault income retain their delivery history. From M10 the Hub asks for two values with rising quotas and rate gates. Each completion adds 15 percentage points to foundry efficiency.

One side contract is active after M3. The seed and contract index select a value from 6, 9, 15, 18, 28, 3, 7 and 12. The quota ranges from 40 to 180. Completion awards eight Sparks per requested unit and adds one quarter of the quota to the Vault. The next delivery counts toward the new contract.

## Foundry ascension

The Ascend tab opens after M7. After M8, select the next run and confirm twice to start a new factory. Each ascension advances the map seed by one. Buildings, cargo, stock, Sparks, upgrades, contracts and milestones start over. Foundry Cores and permanent upgrades carry over. A full reset clears them. Mastery medals also survive ascension and undo. Complete three side contracts to earn Contract Runner. Each of the eight medals adds 3% to Spark yield. The Vault and Ascend tabs show the conditions and earned medals.

Standard runs pay 3, 6, 10 and 15 Cores at M8 through M11. Each additional milestone increases the gain over the previous milestone by one Core. The completed run determines the payout. Prime Rush and High Velocity pay 30% more Cores, rounded up. Prime Rush cycles the primary target through 11, 19, 29, 41, 59 and 83 from M4. At M7, Prime Rush needs 290 units of 41 and 300 units of 12. Both rate gates still apply. High Velocity increases production speed by 35% and rate gates by 50%.

| Core technology | Maximum rank | Effect |
| --- | --- | --- |
| Bootstrap | 5 | Each rank adds one starting belt and extractor level and 50 starting Sparks. |
| Mastery Synergy | 5 | Each rank adds 35% to delivery income and Vault deposits. |
| Beacon Resonance | 3 | Rank 1 raises the combined bonus to 150%. Rank 2 increases the radius to three cells. Rank 3 doubles fuel per item. |
| Vein Richness | 4 | Each rank adds one vein cell to each outer ring on the next seeded board. |
| Contract Mastery | 4 | Each rank adds 40% to Spark and Vault contract rewards. |

The Vault displays stock, deliveries in the last minute, and current uses for each landmark value. The Vault and Ascend tabs show the run seed, mutator, completed milestones, completed contracts and ascensions.

Click the milestone number to see the first ten missions and the elapsed simulation time. The fastest M8 time survives ascension. Ascension starts the run timer at zero. A full reset clears both times.

## Factory controls

On a phone, tap the marked vein to place the first extractor. The game selects Belt. Drag from the extractor to the Hub. Use Rotate beside the tool dock to turn the next building. Drag with one finger in Select to pan. Use two fingers with any tool to pan and zoom. After M1, open Research (U) to inspect an upgrade or expand the floor. A gold dot marks an available purchase or ascension. Use More to mute sound or center the floor.

The Flow Lens (V) shows beacon range, combiners with one empty input, and cargo blocked at the end of a belt. A fueled beacon has a cyan outline. A dormant beacon has a dashed amber outline.

From Ring 2, click or drag the minimap to pan the board. Dragging belts or erasing an area shows the size of the edit. Select **?** beside a mission target or side contract to see a recipe using the veins and operators available on the current floor.

## Global leaderboard

Select the trophy beside **More actions** to open the global leaderboard. Players join automatically after their first delivery. Milestones and ascensions update the score immediately. Other changes sync at most once every 30 seconds during periodic saves. Edit the generated callsign and select **Save & update** to rename the entry.

Each board shows up to 50 players. Foundry Rank orders players by ascensions, lifetime Cores, current milestone and verified delivery rate. Fastest M8 keeps each player's shortest run to M8. Verified Rate keeps the highest measured rate. The server runs a copy of the submitted factory for 600 ticks. Each delivery of a current mission value or Vault landmark counts as six items per minute.

Each entry includes a factory snapshot by default. Clear **Share my factory** and select **Save & update** to remove the Inspect link. **Inspect** runs that snapshot on the board. Local and cloud saves pause during inspection. **Back to my factory** restores the player's factory and resumes saves.

The Worker stores scores in one global Durable Object. Factory saves and shared snapshots use the existing BeltworksFactories KV namespace.
