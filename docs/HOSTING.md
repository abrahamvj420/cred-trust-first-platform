# Hosting the demo

The four web apps run on **Vercel**. The two APIs run together in **one free Render web service**: `scripts/serve-apis.mjs` seeds the databases, starts cred-api and ecosystem-api, and serves both on one address (`/eco/…` goes to ecosystem-api).

Why not the APIs on Vercel too? They keep their data in SQLite files, ecosystem-api sends its webhooks from a loop that runs every second, and the CRED app's live updates are long-lived streams. Vercel's serverless functions have no lasting disk and can't hold those open.

## What to know before sharing the link

- **It's public.** Anyone with the links can use the demo, including the control room (**Reset demo**, **Advance a month**) and the console with the login in the README. All data is synthetic.
- **Render's free tier sleeps after about 15 minutes idle.** The first request afterwards takes about a minute to wake it, and waking re-seeds the demo (the same as **Reset demo**). Open the control room a couple of minutes before you present, and check that every service is green. A paid Render instance ($7/month) doesn't sleep.
- **Both APIs restart and re-seed together**, so the CRED world and the outside world always match.

## Addresses

| What | Where | Environment variables |
|---|---|---|
| CRED app | Vercel project, Root Directory `apps/cred` | `CRED_API_URL`, `ECOSYSTEM_API_URL`, `DEMO_MODE=true` |
| Console + control room | Vercel project, Root Directory `apps/admin` | the same, plus `CRED_APP_URL`, `ADMIN_APP_URL`, `SHOP_APP_URL`, `ECOSYSTEM_APP_URL` and `STATUS_TIMEOUT_MS=8000` (for the service status grid) |
| ShopKart | Vercel project, Root Directory `apps/shop` | the same as CRED app, plus `SHOP_APP_URL` and `SHOPKART_MERCHANT_KEY` (the value Render generated) |
| Partner sites | Vercel project, Root Directory `apps/ecosystem` | the same as CRED app |
| Both APIs | Render, from `render.yaml` | `CRED_APP_URL`, `ADMIN_APP_URL`, `SHOP_APP_URL`, `ECOSYSTEM_APP_URL` (the four Vercel addresses) |

With the APIs at `https://<render-service>.onrender.com`:

```
CRED_API_URL=https://<render-service>.onrender.com
ECOSYSTEM_API_URL=https://<render-service>.onrender.com/eco
```

The API addresses are built into the web apps, so **redeploy the Vercel apps after changing them**.

## Steps

1. **Vercel:** create the four projects from this GitHub repo, each with its Root Directory as above (framework Next.js; Vercel installs the pnpm workspace from the repo root). Note their addresses, e.g. `https://cred-demo-app.vercel.app`.
2. **Render:** New → Blueprint → this repo. Fill in the four app addresses when asked. Wait for the first deploy, then copy the service address and the generated `SHOPKART_MERCHANT_KEY`.
3. **Vercel:** set the environment variables above on each project, then redeploy all four.
4. Open the console's control room: all six services should show green.

## Run the hosted setup locally

```bash
PORT=5900 CRED_API_INTERNAL_PORT=5000 ECOSYSTEM_API_INTERNAL_PORT=5100 \
CRED_DATABASE_URL=file:/tmp/cred.db ECOSYSTEM_DATABASE_URL=file:/tmp/eco.db \
node scripts/serve-apis.mjs
# then: curl localhost:5900/status and localhost:5900/eco/status
```
