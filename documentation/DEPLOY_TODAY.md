# Deploy the Backend Today — Step by Step

This is the concrete "do this now" version of Phase 3. Render is the path here because it has a free tier with no credit card required and reads the `render.yaml` already sitting in `backend/`.

## 1. Push the backend to GitHub (5 min)

```bash
cd EcoStream-System/backend
git init
git add .
git commit -m "EcoStream backend v1.0"
```
Create a new repo on GitHub (github.com/new), then:
```bash
git remote add origin https://github.com/<your-username>/ecostream-backend.git
git branch -M main
git push -u origin main
```

## 2. Deploy on Render (5 min)

1. Go to [render.com](https://render.com) and sign up (free, no card needed for this tier).
2. **New → Blueprint**, connect the GitHub repo you just pushed.
3. Render reads `render.yaml` automatically and shows one service: `ecostream-api`. Click **Apply**.
4. It builds (nothing to build — zero dependencies) and starts. You'll get a URL like `https://ecostream-api.onrender.com`.
5. Check it worked: open `https://ecostream-api.onrender.com/api/health` — you should see `{"status":"ok",...}`.

**Important — the disk.** `render.yaml` mounts a persistent disk at the database folder so your data survives redeploys. Without it, Render's filesystem resets on every deploy and you'd lose all data. Double-check in the Render dashboard under your service → **Disks** that it shows a mounted disk before you start entering real data.

## 3. Point the two portals at your live backend

Open `admin-portal/index.html` (or `client-portal/index.html`) in Chrome, log in, go to **Settings → API Server**, and change it from `http://localhost:4000` to your Render URL (`https://ecostream-api.onrender.com`). Do this once per browser/device — it's saved in that browser's local storage.

## 4. Get a domain (optional, later)

You don't need a domain to start — the `.onrender.com` URL works immediately. When you're ready:
1. Buy a domain (Namecheap, GoDaddy, or your registrar of choice) — something like `ecostream.gm` if available, or `.com`.
2. In Render, go to your service → **Settings → Custom Domain**, add `api.ecostream.gm`.
3. Add the CNAME record Render gives you at your domain registrar's DNS settings.
4. Render issues a free HTTPS certificate automatically once the DNS is verified.

You could similarly host `admin-portal/index.html` and `client-portal/index.html` as static sites on Render (or Netlify/GitHub Pages) under `admin.ecostream.gm` / `portal.ecostream.gm`, but that's not required to get moving today — opening the HTML files locally works fine once they point at your live API.

## Alternatives to Render

- `railway.json` is also included in `backend/` if you prefer [Railway](https://railway.app) — same idea, connect the GitHub repo, it auto-detects the config.
- `Dockerfile` is included if you'd rather deploy to DigitalOcean App Platform, AWS Fargate, or anywhere else that runs containers — `docker build -t ecostream-api . && docker run -p 4000:4000 ecostream-api` works locally to test the container first.