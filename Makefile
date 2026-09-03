.PHONY: install build typecheck dev-web dev-api dev-indexer contract-build

install:
	pnpm install

build:
	pnpm run build

typecheck:
	pnpm run typecheck

dev-web:
	pnpm run dev:web

dev-api:
	pnpm run dev:api

dev-indexer:
	pnpm run dev:indexer

contract-build:
	pnpm run contract:build
