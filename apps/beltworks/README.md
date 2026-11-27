# Beltworks

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
For a custom hostname, set the Actions repository variable `BELTWORKS_DOMAIN`.

The [deployment workflow](../../.github/workflows/deploy-beltworks.yml) validates, builds, and deploys the same commit after a matching push to `master`.
To deploy manually in GitHub Actions, select **Deploy Beltworks**, then **Run workflow**.

To deploy from a terminal with your Alchemy Cloudflare profile, run `bun run --filter '@garage/beltworks' deploy:prod`.
