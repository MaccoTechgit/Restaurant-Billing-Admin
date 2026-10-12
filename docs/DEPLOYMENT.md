# Deployment

## Container
```bash
docker build -f deploy/Dockerfile -t restaurant-billing-admin .
docker run -p 3000:3000 -e BACKEND_URL=https://api.example.com restaurant-billing-admin
```
The image is a static binary on a minimal non-root base. The built-in health check calls `/server -healthcheck`.

## Hosting panels (Dokploy, Coolify, Railway, Render ...)
1. Create an application from this repository, build type **Dockerfile**, Dockerfile path `deploy/Dockerfile`, context `/`.
2. Environment variables: `BACKEND_URL=https://<backend address>` (required). `LOG_FORMAT=json` is already set in the image.
3. Container port **3000** (or set `PORT`). Attach your domain and enable HTTPS in the panel.
4. Health check path: `/healthz` (liveness) and `/readyz` (readiness, needs the backend).
5. After changing environment variables always **redeploy**.

## Checklist
- [ ] Backend deployed and reachable from this server
- [ ] `BACKEND_URL` set, `/readyz` returns 200
- [ ] HTTPS on the public domain
- [ ] Backend started with `TRUST_PROXY=1`, a strong `JWT_SECRET` and `ADMIN_PASSWORD`

## Rolling back
Re-deploy the previous image/commit. The frontend has no data, so a rollback is always safe.
