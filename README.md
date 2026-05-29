# P2P Connect

Peer-to-peer video calling and file sharing app.

- Signaling backend: Cloudflare Worker (Rust) + Durable Objects
- Frontend: Vue 3 + Vite + TypeScript
- Transport: WebRTC (media + data channel)

## Features

- Video calls with audio priority and screen sharing
- File/folder sharing with explorer-style browsing
- Room links using a single route format: `/room/:roomId`
- Auto mode resolution (video/files) from room metadata
- Reconnect handling for refresh/rejoin flows

## Project Structure

```
p2p/
  frontend/   # Vue app
  worker/     # Rust Cloudflare Worker signaling server
  Makefile
```

## Prerequisites

- Node.js 18+
- npm
- Rust toolchain (`rustup`, `cargo`)
- Cloudflare account + Wrangler (`npx wrangler ...` used via project)

## Environment

Create `frontend/.env`:

```env
VITE_WORKER_URL=https://<your-worker-subdomain>.workers.dev
```

For local development with worker on port `8787`, you can use:

```env
VITE_WORKER_URL=http://127.0.0.1:8787
```

## Install

```bash
make install
```

## Run Locally

### Option 1: Run both services

```bash
make dev
```

### Option 2: Run separately

```bash
make worker-dev
make frontend-dev
```

- Worker local URL: `http://127.0.0.1:8787`
- Frontend local URL: `http://127.0.0.1:5173`

## Build

```bash
make worker-build
make frontend-build
```

## Deploy

```bash
make deploy
```

Or deploy separately:

```bash
make worker-deploy
make frontend-deploy
```

## How to Use

1. Open the app home page.
2. Choose `Video Call` or `File Share`.
3. Share the generated room link (`/room/<roomId>`).
4. Second user opens the link; app auto-loads the right mode.

## Notes

- Worker durable object binding is `SIGNALING_ROOM`.
- Room metadata endpoint: `GET /room/:id/info`.
- New room endpoint: `GET /room/new?kind=video|files`.

## Helpful Make Targets

```bash
make help
make clean
```
