# Logbook

Logbook records maintenance for the household's assets.

- An **asset** is a vehicle, part of a home, appliance, piece of equipment, homelab system, or other item. It can have a meter in miles or hours.
- A **schedule** describes recurring maintenance for one asset. Its **cadence** uses elapsed days, a meter interval, either threshold, or an annual date.
- A **task completion** records scheduled work. A **service entry** records other work. Both can record costs and a meter reading.
- An **asset detail** contains the asset's active schedules, specifications, warranties, links, and maintenance spending. **Asset activity** lists the recorded activity for one asset. The **home catalog** summarizes assets and maintenance spending by year of service.

Each asset has its own aggregate. Only an active asset accepts maintenance commands. A meter reading can decrease when the caller marks it as a correction. The domain records the calculated due thresholds on events. The read views use these recorded values. The home catalog uses the single household key `home`.

The domain uses an actor supplied by request middleware. Session authentication belongs in the server.

- `domain/` defines commands, events, and read views.
- `server/` verifies sessions and serves the domain API, MCP tools, and the Frame due report.
- `web/` contains the Foldkit app and a Worker that forwards API requests over a service binding.
- `alchemy.run.ts` configures the two Workers and their binding.
