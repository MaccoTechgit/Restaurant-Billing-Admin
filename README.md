# Restaurant Billing Admin - frontend

The browser application of the restaurant software: POS, kitchen display, orders, inventory, accounting, HR, delivery, reports and settings.
A small Go server delivers the screens and forwards `/api`, `/media` and live updates to the **backend**, which lives in its own repository.

```
browser ──►  this frontend (:3000)  ──►  backend API (:8080)
             screens + reverse proxy      business logic + database
```

[![CI](https://github.com/MaccoTechgit/Restaurant-Billing-Admin/actions/workflows/ci.yml/badge.svg)](https://github.com/MaccoTechgit/Restaurant-Billing-Admin/actions/workflows/ci.yml)

## Quick start
```bash
make run BACKEND=http://127.0.0.1:8080      # or: BACKEND_URL=... go run ./cmd/server
```
Open http://localhost:3000. Requirements: Go 1.22+. No Node, no build step - the client is plain HTML/CSS/JavaScript embedded into the binary.

## Project layout
```
cmd/server/          program entry point (config -> server -> graceful shutdown)
internal/config/     reads and validates environment settings
internal/server/     HTTP routing, reverse proxy, static files, middleware (+ tests)
web/                 the browser client, embedded into the binary
  pages/             HTML screens
  js/                application code (core, ui, boot, pos) and js/modules/ (one file per area)
  css/               styles
  assets/            icon, service worker
deploy/              Dockerfile and a compose example
docs/                architecture and deployment notes
.github/workflows/   CI (format, vet, test, build, image)
```

## Configuration
| Variable | Meaning | Default |
|---|---|---|
| `BACKEND_URL` | address of the backend API | `http://127.0.0.1:8080` |
| `ADDR` / `PORT` | listen address / port (`PORT` is used when `ADDR` is not set) | `:3000` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FORMAT` | `text` or `json` | `text` |
| `SHUTDOWN_TIMEOUT` | time allowed for in-flight requests on shutdown | `15s` |
| `TLS_CERT`, `TLS_KEY` | serve HTTPS directly (usually a reverse proxy does this) | - |

Invalid values stop the server at start-up with a message that lists every problem.

## Endpoints
| Path | What |
|---|---|
| `/login`, `/app`, `/qr`, `/track`, `/display` | screens |
| `/static/...`, `/sw.js`, `/icon.svg` | client files (gzip + ETag, cached for revalidation) |
| `/api/*`, `/media/*`, `/manifest.webmanifest` | forwarded to the backend |
| `/healthz` | the frontend is alive (always 200) |
| `/readyz` | 200 only when the backend answers as well (for load balancers) |

## Connect to the backend
Deploy the backend repository, then set `BACKEND_URL` here to its address and redeploy. Browsers only talk to the frontend, so the backend needs no CORS
and no public address - a private one works. Run the backend with `TRUST_PROXY=1` so it sees real visitor addresses.

## Development
```bash
make check      # gofmt, go vet, go test - what CI runs
make build      # static binary in bin/server
make docker     # container image
```
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md).
