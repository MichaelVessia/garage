# Lawnmog

[Play Lawnmog on Clover Lane](https://lawnmog.vessia.net/). Friends can open this link and claim different properties on the same street.

Run the shared game locally from the repository root.

```sh
bun install
bun run --filter '@garage/lawnmog' dev
```

Open the URL that Wrangler prints. Click the street, then use W, A, S, and D to walk. Hold Q to turn left or E to turn right. Drag or use the arrow keys to look. Press V to switch between first person and third person. Double-click to capture the mouse. Press Escape to release it.

Approach the sidewalk sign for a bot lawn. Press F or select **Claim lawn**, enter a display name, and submit the form. Stand on your lawn and hold Space or the left mouse button to use your tool. On touch screens, drag on the left to walk and on the right to look. Hold the work button to use your tool.

Use the reel mower on tall grass or the watering can on dry patches. Both tools are free to use. After each successful pass, the receipt shows earnings, supply costs, and the change in your balance. A patch pays once until you improve 16 different patches. More care on a patch that already paid can still use supplies. You need enough coins for the supplies before the tool will run. Mow the marked quarter of your lawn to earn the job bonus. The next job moves to another quarter.

Press B to open the tool shed. Check the job progress, bonus, and amount needed for the next upgrade. Each tool lists its effect and operating cost. Buy equipment with coins. Select **Equip** to carry an owned tool. Place a sprinkler on your lawn or buy irrigation for the whole lawn. The shed switch controls automatic watering. On a dry tick, it uses coins only if the system waters your lawn and you have enough coins. XP unlocks mow patterns. The game saves your equipped tool and selected pattern when you change them.

The starter scoop adds 8 fertility to one patch. A drop spreader feeds a strip of three patches. A broadcast spreader feeds nine. Aim for 72% fertility. Grass uses the most nutrients in spring. Disease grows faster below 32% fertility, in very wet soil, and in very dry soil. Use the spot bottle on a small outbreak. Upgrade to the pump sprayer for strips or the backpack sprayer for a 3 × 3 area.

Each season lasts 2 minutes and 15 seconds. Autumn starts every nine minutes. Mow spring and summer weeds. In autumn, equip your free rake and work a pile to bag it. A handheld blower costs 60 coins and moves leaves one patch per pass. The backpack upgrade costs 260 coins and moves leaves up to three patches. With **Clear lawn** selected, hold Work to sweep a 3 × 3 area with the handheld blower or a 5 × 5 area with the backpack blower. Choose a neighbor from the same menu and press Work once to send a pile. On desktop, Work is Space or the left mouse button. Each resident gets a starter bag of 25 leaves. A shot gathers loose leaves from your lawn, then uses your bagged leaves. Refill the bag with your rake. It works from anywhere on the block. To aim your blower yourself, select **Push forward** and face the direction you want leaves to travel. Aim across a side boundary to send leaves next door, or across the front curb to send them to the house opposite. If leaves land on Karen’s lawn, she can fine you up to 10 coins per burst. Grass grows more slowly in winter.

Select the online count or press N to see the HOA standard, the next inspection time, and the curb appeal rankings. The HOA inspects the block every six minutes. If your lawn is at risk, open the notice for the current reading, the next possible fine, and the remedy. The last inspection shows the result and the coins deducted. New owners get at least six minutes to prepare. Fines start at 5 coins, rise to 10 and then 15, and stop at your balance. A pass resets the next fine to 5 coins. You can receive only one fine while away.

To join as a second player, open the same URL in a separate browser profile or private window. Each profile keeps its own lawn through a session cookie. Wrangler stores the shared street in local Durable Object storage.

Run the focused checks from the repository root.

```sh
bun run --filter '@garage/lawnmog' typecheck
bun run --filter '@garage/lawnmog' test
bun run --filter '@garage/lawnmog' build
```

Recent block chat messages appear on the left during play. Press Enter or T, or tap **Block chat**, to scroll up to 50 messages from the past hour. Residents can type a message and press Enter or tap **Send** to return to play. Press Escape or tap **Close** to discard a draft.

## Production deployment

The Deploy Lawnmog workflow validates and deploys the same commit to Cloudflare Workers. It uses the repository’s Cloudflare account ID and API token. The Worker serves the game and its API at `lawnmog.vessia.net`. The Block Durable Object stores the shared street and chat.

### Yard of the Week

Karen awards the gold sign to the resident with the highest curb appeal at the end of each nine-minute game year. The street gets a one-minute warning. Open Neighbors to see who holds the sign.

A leaf pile from a neighbor can go straight back. Equip either blower, face the pile on your lawn, and press Work once. Your friend can return it the same way.
