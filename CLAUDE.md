# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hyperlane Explorer is a Next.js 15 web application for exploring interchain messages on the Hyperlane protocol. It allows users to search, view, and debug cross-chain messages.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (http://localhost:3000)
pnpm run build        # Production build
pnpm run typecheck    # TypeScript type checking
pnpm run lint         # ESLint with Next.js rules
pnpm run test         # Run Jest tests
pnpm run prettier     # Format code in src/
```

## Architecture

### State Management
- **Zustand store** (`src/store.ts`) manages global state: chain metadata, MultiProtocolProvider, warp routes
- State persists to localStorage with version migrations
- Use `useMultiProvider()`, `useChainMetadata()`, `useRegistry()` hooks to access state

### Data Fetching
- **GraphQL via urql** for querying the Hasura API (`https://explorer4.hasura.app/v1/graphql`)
- **TanStack React Query** for caching
- **Ethers.js v5** for direct blockchain calls
- PI (Permissionless Interop) chains have separate query paths in `src/features/messages/pi-queries/`

### Feature Structure
Features are self-contained in `src/features/`:
- `messages/` - Message search, display, and detail cards
- `chains/` - Chain metadata and configuration
- `api/` - External API integration
- `deliveryStatus/` - Message delivery tracking
- `debugger/` - Message inspection utilities

### URL State
Search filters sync with URL query params via `src/utils/queryParams.ts` for shareable links.

### Key Dependencies
- `@hyperlane-xyz/sdk` - Core Hyperlane SDK
- `@hyperlane-xyz/registry` - Chain and protocol registry (fetched at runtime)
- `@hyperlane-xyz/widgets` - Pre-built UI components

## Configuration

### Environment Variables
- `NEXT_PUBLIC_REGISTRY_URL` - Custom registry URL (optional)
- `NEXT_PUBLIC_REGISTRY_BRANCH` - Registry branch (default: 'main')
- `EXPLORER_API_KEYS` - JSON object with block explorer API keys

### Important Config Files
- `src/consts/config.ts` - Runtime configuration
- `src/consts/api.ts` - API endpoints
- `tailwind.config.js` - Custom colors, spacing, and `xs` breakpoint at 480px

## Code Style

- Single quotes, trailing commas, 100 char line width
- Prettier with import organization and Tailwind class sorting
- Use `clsx()` for conditional classNames
