# Subq development and deployment

Subq is a single-owner journal for weight, injections, schedules, and goals.
The Alchemy stack runs a Foldkit website Worker and a journal Worker.
Cloudflare Access controls access to the website. The journal Worker checks
the Access token and stores events in Cloudflare Durable Objects.

## Local development

From the repository root, set a local owner email and start the stack.

```sh
SUBQ_DEV_EMAIL=owner@example.com bun run --filter '@garage/subq' dev
```

Development uses local Alchemy state and local Durable Objects. Open the website
URL that Alchemy prints. The browser connects to the journal through `/api`.

## Production configuration

Create a Cloudflare Access application for the website hostname. Add an Allow
policy for the owner. Set these values in `apps/subq/.env.prod`.

| Variable | Value |
| --- | --- |
| `SUBQ_DOMAIN` | Website hostname protected by Cloudflare Access |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain |
| `CF_ACCESS_AUD` | Access application audience |
| `SUBQ_OWNER_EMAIL` | Email address permitted to read and change the journal |
| `SUBQ_API_TOKEN` | Optional bearer token for direct API clients |

Review the production plan before deployment.

```sh
bun run --filter '@garage/subq' plan --stage prod
bun run --filter '@garage/subq' deploy:prod
```

The website Worker forwards `/api` and its subpaths, `/v1` and its subpaths,
`/mcp`, and `/health`. The OpenAPI document is at `/v1/openapi.json`.

## Import a backup

In **Settings**, select **Import Data** and choose a Subq `4.0.0` or
`3.0.0-alpha.2` JSON file. Check the record counts before you select
**Replace All Data**. Use **Export Data** to download a version `4.0.0` backup.
