.PHONY: help \
        worker-dev worker-build worker-deploy \
        frontend-dev frontend-build frontend-deploy \
        dev deploy install clean

WORKER_DIR  := worker
FRONTEND_DIR := frontend

# ── Default target ──────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  P2P — available targets"
	@echo ""
	@echo "  Development"
	@echo "    make dev              Run worker + frontend dev servers concurrently"
	@echo "    make worker-dev       Run Cloudflare Worker locally  (port 8787)"
	@echo "    make frontend-dev     Run Vue/Vite dev server        (port 5173)"
	@echo ""
	@echo "  Build"
	@echo "    make worker-build     Compile Rust Worker to WASM"
	@echo "    make frontend-build   Type-check + Vite production build"
	@echo ""
	@echo "  Deploy"
	@echo "    make deploy           Deploy worker then frontend"
	@echo "    make worker-deploy    Deploy worker to Cloudflare Workers"
	@echo "    make frontend-deploy  Deploy frontend to Cloudflare Pages"
	@echo ""
	@echo "  Misc"
	@echo "    make install          Install all npm dependencies"
	@echo "    make clean            Remove build artifacts"
	@echo ""

# ── Install ─────────────────────────────────────────────────────────────────
install:
	cd $(FRONTEND_DIR) && npm install

# ── Worker ──────────────────────────────────────────────────────────────────
worker-dev:
	cd $(WORKER_DIR) && cargo install -q worker-build && npx wrangler dev --port 8787

worker-build:
	cd $(WORKER_DIR) && cargo install -q worker-build && worker-build --release

worker-deploy:
	cd $(WORKER_DIR) && npx wrangler deploy

# ── Frontend ─────────────────────────────────────────────────────────────────
frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

frontend-build:
	cd $(FRONTEND_DIR) && npm run build

frontend-deploy: frontend-build
	cd $(FRONTEND_DIR) && npx wrangler pages deploy dist \
		--project-name p2p-frontend \
		--branch main

# ── Combined ─────────────────────────────────────────────────────────────────
dev:
	@command -v concurrently >/dev/null 2>&1 || npm install -g concurrently
	concurrently \
		--names "worker,frontend" \
		--prefix-colors "magenta,cyan" \
		"$(MAKE) worker-dev" \
		"$(MAKE) frontend-dev"

deploy: worker-deploy frontend-deploy

# ── Clean ────────────────────────────────────────────────────────────────────
clean:
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(WORKER_DIR)/build
	cd $(WORKER_DIR) && cargo clean
