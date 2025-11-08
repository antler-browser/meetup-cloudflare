# CLAUDE.md for Meetup Mini App

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An IRL Browser mini app for meetup check-ins with real-time attendee list. Uses `window.irlBrowser` API for profile access with JWT verification. This mini app is meant to run inside an IRL Browser like Antler. See `/docs/irl-browser-standard.md` for IRL Browser Standard specification.

**Project Structure**: This is a pnpm workspace monorepo with three packages:
- `client/` - React frontend (Vite)
- `server/` - Hono backend with SSE
- `shared/` - Shared JWT utilities used by both client and server

## Key Files and Directories

### Client (`/client/`)
- `/client/src/components/`: React components
  - `/QRCodePanel.tsx` - Shows a QR code for app. Hidden on mobile, visible on desktop.
  - `/Avatar.tsx` - Displays a user's avatar or placeholder if no avatar is set.
  - `/UserList.tsx` - Real-time list of meetup users
- `/client/src/app.tsx` - Main component with IRL Browser integration and profile display
- `/client/src/main.tsx` - Entry point that renders App (initializes IRL Browser Simulator in dev mode)
- `/client/public/`: Public files
  - `irl-manifest.json` - Mini app IRL Browser manifest with metadata and requested permissions
  - `antler-icon.webp` - Mini app icon
- `/client/vite.config.ts` - Vite configuration with proxy to backend

### Server (`/server/`)
- `/server/src/index.ts` - Hono server with check-in API and SSE for real-time updates
- `/server/src/db/index.ts` - Database operations using Drizzle ORM
- `/server/src/db/client.ts` - Database client with environment-aware connection (local SQLite or Turso)
- `/server/src/db/models/index.ts` - Database models
- `/server/src/db/schema.ts` - Drizzle schema definition for attendees table
- `/server/src/db/migrations/` - Drizzle Kit migrations folder
- `/server/drizzle.config.js` - Drizzle Kit configuration
- `/server/.env.example` - Environment variables example
- `/server/data/` - Local SQLite database file (development)
- `/server/src/sse.ts` - Server-Sent Events (SSE) implementation for real-time updates

### Shared (`/shared/`)
- `/shared/src/jwt.ts` - JWT decoding and verification utilities (used by both client and server)
- `/shared/src/index.ts` - Package exports

### Root
- `/docs/`: Documentation
  - `irl-browser-standard.md` - IRL Browser Standard specification
- `data.json` - Meetup details (`scripts/update-metadata.js` takes details from this file and updates the client/public/irl-manifest.json and index.html files)
- `pnpm-workspace.yaml` - Workspace configuration

## Development Commands

All commands run from the workspace root:

```bash
pnpm install          # Install all workspace dependencies
pnpm run dev          # Start both client (localhost:5173) and server (localhost:3000) in parallel
pnpm run dev:client   # Start only client dev server
pnpm run dev:server   # Start only server dev server
pnpm run build        # Build shared package, then server, then client
```

### Database Commands (from `/server/`)

```bash
pnpm db:generate      # Check schema and generate migration files
pnpm db:push          # Run migrations
pnpm db:studio        # Open Drizzle Studio visual database manager
```

**Note**: This is a pnpm workspace. All dependencies are installed at the root level. Shared dependencies (@noble/curves, base58-universal, jwt-decode) are hoisted to the workspace root.

## Architecture Overview

### Database Architecture (Drizzle ORM + Turso)

The application uses Drizzle ORM with an environment-aware database connection:

**Development**: Local SQLite file at `/server/data/meetup.db` 
**Production**: Turso remote database (update `DATABASE_DIALECT`, `DATABASE_URL` and `DATABASE_AUTH_TOKEN` environment variables in the Railway service)

### JWT Verification Pipeline (`/shared/src/jwt.ts`)
The shared package exports `decodeAndVerifyJWT` which is used by both client and server:

1. Decode JWT with `jwt-decode`
2. Extract issuer DID from `iss` claim
3. Reject if JWT is expired (`exp` claim)
4. Reject if JWT is not intended for this application (`aud` claim)
5. Parse public key from DID: strip `did:key:z`, decode base58, remove multicodec prefix `[0xed, 0x01]`
6. Verify Ed25519 signature using `@noble/curves`: `ed25519.verify(signature, message, publicKeyBytes)`
7. Return typed payload

**Key detail**: Uses @noble/curves library for signature verification. (Cannot use Web Crypto APIs as most mobile browsers don't support Ed25519 yet.)

**Import**: Both client and server import from `@meetup/shared` workspace package.

### Responsive Layout
- **Mobile**: Single column, QR code hidden
- **Desktop**: Two columns with QR code panel on left

## Development Workflow

### Debugging IRL Browser Mini Apps
The IRL Browser Simulator injects the `window.irlBrowser` API into a regular browser, allowing you to test your mini app locally without needing the Antler mobile app.

**Note:** This is a development-only tool and should never be used in production.

```typescript
if (import.meta.env.DEV) {
  const simulator = await import('irl-browser-simulator')
  simulator.enableIrlBrowserSimulator()
}
```

That's it! The simulator will:
- Inject `window.irlBrowser` into your page
- Load a default test profile (Paul Morphy)
- Show a floating debug panel
- Click "Open as X" to open a new tab and simulate multiple users
- Load a profile from the URL parameter `?irlProfile=<id>`

## Third Party Libraries

### Client
- **React** - UI framework
- **Tailwind** - CSS framework
- **qrcode.react** - QR code generation
- **irl-browser-simulator** - IRL Browser debugging (dev only)
- **Vite** - Build tool

### Server
- **Hono** - Web framework
- **@hono/node-server** - Node.js adapter
- **Drizzle ORM** - TypeScript ORM for database operations
- **@libsql/client** - LibSQL client (compatible with SQLite and Turso)

### Shared (hoisted to workspace root)
- **@noble/curves** - Ed25519 signature verification
- **base58-universal** - Base58 encoding
- **jwt-decode** - JWT decoding

## Troubleshooting

### JWT Verification Failures
- Expired JWT (`exp` claim)
- Invalid signature
- Malformed DID (must start with `did:key:z`)
- Audience claim mismatch (must match production URL)

### Profile Not Loading
Check if API exists: `console.log(window.irlBrowser)`

### Build Errors
- Run `pnpm install`
- Check TypeScript errors: `pnpm run build`