# Beltworks

For machine unlocks, controls, and Foundry Core rewards, see the [game guide](CONTEXT.md).

Run these commands from the repository root.

## Local development

To start the web app, run `bun run --filter '@garage/beltworks-web' dev`.

To start the full stack with local Workers, run `bun run --filter '@garage/beltworks' dev`.

## Production deployment

In the GitHub repository settings, add these Actions secrets.

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The ID of the Cloudflare account that hosts Beltworks. |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with access to deploy the Beltworks Workers and manage the Alchemy state store in that account. |

Alchemy stores its state encryption key in Cloudflare Secrets Store.
Alchemy binds `beltworks.vessia.net` by default in production.
To use another hostname, set `BELTWORKS_DOMAIN` in the terminal or as a GitHub Actions repository variable.

The [deployment workflow](../../.github/workflows/deploy-beltworks.yml) validates, builds, and deploys the same commit after a matching push to `master`.
To deploy manually in GitHub Actions, select **Deploy Beltworks**, then **Run workflow**.

To deploy from a terminal with your Alchemy Cloudflare profile, run `bun run --filter '@garage/beltworks' deploy:prod`.
