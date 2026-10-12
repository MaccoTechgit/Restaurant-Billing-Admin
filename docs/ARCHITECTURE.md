# Architecture

## Responsibilities
| Part | Does | Does not |
|---|---|---|
| **Frontend (this repo)** | serves the client, forwards API traffic, compresses and caches static files, sets security headers, exposes health checks | hold data or business rules |
| **Backend (other repo)** | authentication, permissions, orders, stock, accounting, HR, reports, database | serve screens |

Keeping them apart means each can be deployed, scaled and secured on its own, and the client never needs backend credentials.

## Request flow
1. The browser asks the frontend for `/app`. The server returns the HTML (gzip, `no-cache` + ETag so updates arrive at once and repeat visits cost a 304).
2. The page loads `/static/js/*` and `/static/css/*`. Files are hashed and compressed once at start-up.
3. API calls (`/api/...`) go through a reverse proxy to `BACKEND_URL`. Responses of type JSON/text are gzip-compressed; the live-update stream
   (`/api/events`, `text/event-stream`) is passed through untouched and flushed immediately.
4. If the backend is down, the proxy answers `502` with a friendly JSON message and `/readyz` returns `503`.

## Server internals (`internal/server`)
- `server.go` - routes, proxy, health/readiness, graceful shutdown.
- `static.go` - embedded files: content types, ETags, gzip copies.
- `middleware.go` - request id, panic recovery, access log (no query strings - they can hold tokens), security headers, JSON gzip.
- Middleware order: request id -> recover -> access log -> security headers -> router.

## Client (`web/`)
Plain JavaScript, no build step. `core.js` (state, API helper, printing) -> `ui.js` (components) -> `js/modules/*` (screens per area) -> `boot.js`
(login state, navigation, live updates). `sw.js` is served from `/` so its scope covers the whole site.

## Security
- CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS behind HTTPS, restricted `Permissions-Policy`.
- Static paths are whitelisted (`js/`, `css/`, `assets/`) and cleaned; traversal attempts return 404.
- The server runs as a non-root user in the container image, with a built-in `-healthcheck` command.

## Scaling
The frontend is stateless: run as many copies as needed behind a load balancer. All state lives in the backend.
