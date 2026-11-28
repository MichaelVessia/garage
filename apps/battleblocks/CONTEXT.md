# Battleblocks

Battleblocks is a 1v1 tactical card dueling game inspired by Flash Duel, set in a block-built arena, rendered in 3D with PixiJS and `@pixi/3d` and synchronized over Cloudflare Durable Objects.

## Ruleset

Two duelists start on opposite ends of an 18-space linear track, spaces 1 and 18, facing each other. Both players draw from one shared 25-card deck containing five copies each of values 1 through 5. Each player holds up to 5 cards and draws back up to 5 at the end of their own turn.

### Turn actions

- **Move.** Play 1 card to move forward or backward by its exact value without moving through the opponent.
- **Push.** When adjacent at distance 1, play 1 card to push the opponent backward by its value, stopping at the board edge.
- **Strike.** Play 1 or more matching copies of the number equal to the exact distance between both duelists. The defender must discard the same count of that exact value to block, or lose the round.
- **Dashing strike.** Play 1 card to dash forward, then play 1 or more matching copies of a second card matching the new distance to strike. Against a dashing strike, the defender may block normally or retreat by playing 1 card to step backward that many spaces. A defender at the board edge cannot retreat. A defender who retreats automatically skips their next turn and draws back up to 5 cards.

A player who starts a turn with no legal action also recovers automatically. If their hand is full, they discard its first card. They then draw back up to 5 and pass the turn.

### Rounds and matches

One unblocked hit wins the round. Matches are best 3 of 5 rounds. When the draw deck empties, the discard pile reshuffles up to twice per round. If the deck empties after the second reshuffle, the round ends on position: the duelist who advanced further from their starting edge wins, or the round ties if both advanced equally.

## Architecture

- `@garage/battleblocks-domain` owns the pure Effect Schema state machine, legal move queries, fog-of-war view projection, and local bot opponent.
- `@garage/battleblocks-server` owns the Worker HTTP router and `DuelRoomObject` Durable Object with hibernatable WebSockets for authoritative 1v1 rooms.
- `@garage/battleblocks-web` owns the PixiJS and `@pixi/3d` procedural 3D arena, animations, 2D card HUD, room-link multiplayer client, and local bot mode.
