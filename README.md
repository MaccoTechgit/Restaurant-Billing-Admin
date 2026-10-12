# Restaurant Billing Admin (frontend)

The web screens of the restaurant software - POS, kitchen display, orders, inventory, accounting, HR, delivery, reports and settings.
It is a small Go server that serves the screens and forwards `/api`, `/media` and live updates to the **backend**, which lives in its own repository.

```
browser  ->  this frontend (:3000)  ->  backend API (:8080)
```

## Run
```bash
BACKEND_URL=http://127.0.0.1:8080 go run .
```
Then open http://localhost:3000

| Variable | Meaning | Default |
|---|---|---|
| `BACKEND_URL` | address of the backend API | `http://127.0.0.1:8080` |
| `ADDR` | address this server listens on | `:3000` |
| `TLS_CERT`, `TLS_KEY` | serve HTTPS directly (optional) | - |

## Connect to the backend
1. Deploy the backend repository and note its address, e.g. `https://api.example.com`.
2. Set `BACKEND_URL` of this frontend to that address and redeploy.
3. Browsers only talk to the frontend, so the backend does not need CORS or a public domain - a private address works if the frontend server can reach it.

## Docker
```bash
docker build -t restaurant-admin-frontend .
docker run -p 3000:3000 -e BACKEND_URL=http://backend:8080 restaurant-admin-frontend
```
