/**
 * Side by side for presenting: the CRED app in the left phone, ShopKart in the right.
 *
 *   pnpm demo            (in another terminal)
 *   pnpm side-by-side    → http://localhost:3005
 *
 * Just the two phones; use each one as you normally would.
 */
import http from 'node:http';

const PORT = Number(process.env.SIDE_BY_SIDE_PORT ?? 3005);
const CRED = process.env.CRED_APP_URL ?? 'http://localhost:3000';
const SHOP = process.env.SHOP_APP_URL ?? 'http://localhost:3002';

const page = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CRED and ShopKart</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #0b0b0c; }
  main { height: 100vh; display: flex; align-items: center; justify-content: center; gap: 6vw; padding: 2vh 0; }
  .phone { width: 390px; height: 844px; flex: none; border: 10px solid #000; border-radius: 44px; overflow: hidden; background: #000; box-shadow: 0 0 0 1px #2a2a2e, 0 20px 60px rgba(0,0,0,.6); }
  .phone iframe { width: 100%; height: 100%; border: 0; display: block; }
</style>
</head>
<body>
<main>
  <div class="phone"><iframe title="CRED app" src="${CRED}/"></iframe></div>
  <div class="phone"><iframe title="ShopKart" src="${SHOP}/"></iframe></div>
</main>
<script>
  // Fit both phones to the window
  const fit = () => {
    const s = Math.min(1, (innerHeight * 0.96) / 864, (innerWidth * 0.45) / 410);
    document.querySelectorAll('.phone').forEach((p) => (p.style.zoom = s));
  };
  addEventListener('resize', fit);
  fit();
</script>
</body>
</html>`;

http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
  })
  .listen(PORT, () => console.log(`Side by side: http://localhost:${PORT}  (CRED left, ShopKart right; needs pnpm demo running)`));
