# Logbook

## Record an asset

Open **Quick Log** and select **New asset**. You can enter the make, model, serial number, purchase date, price, and location.

Open **Assets** to find the record by name, category, location, make, model, serial number, or specification. Select an active asset to edit its details, add a maintenance schedule, record a warranty, set a specification, or attach a link to a manual.

To share an asset, copy its link from **Assets** or **Due**. You can also open the asset and copy the address from the browser. The link opens the asset after sign-in if the recipient has access to Logbook.

## Track a repair

Open the asset and select **Add pending work**. Enter a title. Use the notes field for parts and their storage location. The due date is optional. Open the **Due** screen to see pending work across all assets. Select **Mark done** to record the work once.

On an active asset, use the controls beside a schedule, warranty, specification, or link to correct it. You can stop a schedule and keep its completed work. Open **Service history** on the asset to see work by performed date, including recorded parts, costs, and notes.

## Develop locally

From the repository root, run:

```sh
bun install
LOGBOOK_DEV_EMAIL=michael@vessia.net bun run --filter '@garage/logbook' dev
```

Open the app URL that Alchemy prints. Local development uses local state and grants the configured email owner access. Keep this server on your local computer.

## Deploy to production

1. Create a Cloudflare Access application for the Logbook host. Add an Allow policy for the owner. For machine clients, add a Service Auth policy and create a service token.
2. Set the following deployment variables. Alchemy binds the session configuration to the server Worker.

| Variable | Value |
| --- | --- |
| `LOGBOOK_DOMAIN` | Optional custom host name for the app Worker. |
| `CF_ACCESS_TEAM_DOMAIN` | Access team host, such as `example.cloudflareaccess.com`. |
| `CF_ACCESS_AUD` | Audience tag of the Logbook Access application. |
| `LOGBOOK_OWNER_EMAIL` | Email address permitted to sign in as the owner. |
| `LOGBOOK_API_TOKEN` | Optional secret bearer token for requests that can reach the Worker without an Access assertion. |

3. Run the plan and review it. Then deploy.

```sh
bun run --filter '@garage/logbook' plan --stage prod
bun run --filter '@garage/logbook' deploy:prod
```

Use the app Worker URL for the web app and its APIs. The browser uses the Access session cookie for live reads and commands.

## Connect clients

- In Executor v2, configure an HTTP MCP server at `https://<logbook-host>/mcp`.
- For Frame (`apps/frame`), use `GET https://<logbook-host>/frame/due`. The report looks ahead 30 days for maintenance and 60 days for warranties. The default meter threshold is 500 miles or 25 hours, according to the asset's meter unit. Use the optional `withinMeter` query parameter to set the same numeric threshold for all metered assets, in each asset's meter unit. Use `withinDays` and `warrantyDays` to change the date limits.

The Frame report includes a `pendingRepairs` array with all open pending work on active assets. Each entry has `assetId`, `assetName`, `category`, `workId`, and `title`. The entry also has `notes` and `dueOn` when the work record contains those fields. The date and meter limits do not filter this array.

To link from Frame to an asset, resolve `/assets/${encodeURIComponent(assetId)}` against the configured Logbook base URL. Use the Logbook app host protected by Cloudflare Access.

For both clients, set `CF-Access-Client-Id` and `CF-Access-Client-Secret` to the service token credentials when Access protects the host. For a host that accepts the optional Logbook API token, send `Authorization: Bearer <token>`.
