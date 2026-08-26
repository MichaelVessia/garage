# Garage MCP

Garage MCP is the consolidated HTTP MCP delivery edge for Garage integration packages. It exposes domain-shaped tools without duplicating each package's external adapter.

The server currently delegates to two integration packages:

- `@garage/sabnzbd`: `sabnzbd_status`, `sabnzbd_version`, `sabnzbd_queue`, `sabnzbd_history`, `sabnzbd_server_stats`, `sabnzbd_pause`, `sabnzbd_resume`, and `sabnzbd_delete`
- `@garage/autocaliweb`: `autocaliweb_status`, `autocaliweb_version`, `autocaliweb_stats`, `autocaliweb_catalog`, `autocaliweb_books`, `autocaliweb_recent`, `autocaliweb_search`, `autocaliweb_book_info`, and `autocaliweb_shelves`

All AutoCaliWeb tools are read-only and cover only its API/catalog surface; file ingestion is deliberately excluded. SABnzbd deletion is marked destructive for MCP policy. Deleting downloaded data also requires both `deleteFiles: true` and `confirmDeleteFiles: true`.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AUTOCALIWEB_URL` | yes | none | AutoCaliWeb base URL |
| `AUTOCALIWEB_USERNAME` | yes | none | AutoCaliWeb Basic-auth username |
| `AUTOCALIWEB_PASSWORD` | yes | none | Redacted AutoCaliWeb Basic-auth password |
| `SABNZBD_URL` | yes | none | SABnzbd base URL |
| `SABNZBD_API_KEY` | yes | none | Redacted SABnzbd API credential |
| `GARAGE_MCP_PORT` | no | `3000` | HTTP listen port |

Do not place credentials in command arguments, images, repository files, or logs. Production deployment supplies them through a root-readable environment file or secret mechanism.

The current Executor deployment uses the MCP integration's `none` authentication template because the container has no published port and only shares Executor's private Docker network. If the endpoint becomes reachable by any other network or tenant, add application authentication before exposing it.

## Endpoints

- MCP: `POST /mcp`
- readiness: `GET /health`

The readiness endpoint proves that the process and HTTP router are available. It does not contact upstream services; tool calls represent configuration or upstream failures through the MCP error result.

## Development

```sh
bun run --filter '@garage/mcp' typecheck
bun run --filter '@garage/mcp' lint
bun run --filter '@garage/mcp' test
bun run --filter '@garage/mcp' build
```

Run the compiled executable on a non-default local port when port 3000 is occupied:

```sh
GARAGE_MCP_PORT=3311 apps/garage-mcp/dist/garage-mcp
```

## Nix container image

```sh
nix build .#garage-mcp-image
docker load -i result
```

The image is tagged `garage-mcp:0.0.0`, runs as numeric UID/GID `65532:65532`, listens on container port 3000, and includes a Docker health check for `/health`.
