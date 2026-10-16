# CloudFetch — Cloudflare download-link website

## Important limitation
This Worker streams a public HTTPS URL through Cloudflare; it does not guarantee faster downloads. It does not cache large files, bypass source rate limits, or make a slow origin faster. Check current Cloudflare Workers limits and terms before using it for large/high-volume downloads.

## Deploy the Worker
1. Install Node.js, then open a terminal in this folder.
2. Run `npx wrangler login`.
3. Run `npx wrangler deploy`.
4. Copy the deployed Worker URL, for example `https://cloudfetch-download.<your-subdomain>.workers.dev/`.
5. In `index.html`, replace `https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev/` with that exact URL.

## Deploy the website
1. Create a Cloudflare Pages project and choose **Direct Upload** (or connect a Git repository).
2. Upload `index.html` as the static site. Keep `worker.js` and `wrangler.toml` in your Worker project folder for deploying the Worker.
3. Open the Pages URL and test with a small public file from a source that allows downloading.

## Before public use
- Add authentication and per-user rate limits.
- Restrict CORS to your own Pages domain.
- Add stricter URL/IP/redirect validation and abuse monitoring.
- Do not use for private links, bypassing access controls, or copyrighted files without permission.
