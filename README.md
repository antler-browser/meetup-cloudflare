# Meetup Mini App

A mini app built with Antler IRL Browser that displays a list of everyone that scanned a QR code.

## Overview

This is a pnpm workspace monorepo with three packages:
- **client/** - React frontend
- **server/** - Hono backend (REST API + SSE for real-time updates + SQLite database)
- **shared/** - Shared utilities (JWT verification, Social links, etc.)

### How it works

1. User scans QR code with Antler
2. Client requests profile from `window.irlBrowser.getProfileDetails()` API
3. IRL Browser generates and signs JWT with profile details
4. JWT is sent to server, verified, stored in the database, and broadcasted to all connected clients via SSE
5. All connected clients see real-time list of everyone that scanned the QR code

## Getting Started

Commands to run from the workspace root:

```bash
pnpm install          # Install all workspace dependencies
pnpm run dev          # Start both client (localhost:5173) and server (localhost:3000)
pnpm run dev:client   # Start only client
pnpm run dev:server   # Start only server
pnpm run build        # Build all packages (shared → server → client)
```

Commands to run from the server package:

```bash
pnpm db:generate      # Check schema and generate migration files
pnpm db:push          # Run migrations
pnpm db:studio        # Open Drizzle Studio visual database manager
```

### Running the app locally

1. Run `pnpm i` to install dependencies
2. Copy the `server/.env.example` file to `server/.env`. The defaults should work for local development.
3. Update `data.json` with meetup details
4. Run `pnpm run dev` to start both client and server
5. Open `http://localhost:5173` in your browser. IRL Browser Simulator is enabled in development mode, so you will instantly login with a test profile (Paul Morphy). 
6. If you need to test multiple users using your app, click the IRL Browser Simulator debug panel "Open as X" button to open a new tab and simulate multiple users.

### Running the app in production
We use Railway to host the server (REST API + SSE) and Turso to host the SQLite database. Both have a free tier.

1. Create a Turso database. (and Sign up for a Turso account if you don't have one yet)
- Install Turso CLI: https://docs.turso.tech/cli/installation
- Create account and database:
   ```bash
   turso auth signup
   turso db create meetup
   ```
- Get credentials:
   ```bash
   turso db show meetup --url      # Keep this value for DATABASE_URL
   turso db tokens create meetup   # Keep this value for DATABASE_AUTH_TOKEN
   ```

2. Create a Railway service. (and Sign up for a Railway account if you don't have one yet)
- Add the following environment variables to the Railway service:
   - `DATABASE_DIALECT` - `turso`
   - `DATABASE_URL` - From previous step
   - `DATABASE_AUTH_TOKEN` - From previous step
- Deploy your service

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

## Tech Stack

### Frontend (client/)
- **React** - UI library
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **qrcode.react** - Display QR code
- **irl-browser-simulator** - IRL Browser debugging (dev only)

### Backend (server/)
- **Hono** - REST API framework
- **@hono/node-server** - Node.js adapter
- **Drizzle ORM** - TypeScript ORM for database operations
- **@libsql/client** (development) **turso-js** (production) - LibSQL client for database operations
- **Server-Sent Events (SSE)** - Real-time updates

### Shared (shared/)
- **@noble/curves** - Ed25519 signature verification
- **base58-universal** - Base58 encoding/decoding
- **jwt-decode** - JWT parsing

All shared dependencies are hoisted to the workspace root via pnpm.