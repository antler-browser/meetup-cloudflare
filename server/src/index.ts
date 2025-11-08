/**
 * Hono server with SSE for real-time meetup user updates
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { database as _ } from './db/index.js'
import * as UserModel from './db/models/users.js'
import { decodeAndVerifyJWT } from '@meetup/shared'
import { broadcastNewUser, broadcastUserLeft, setupSSERoute, getActiveConnectionCount } from './sse.js'

const app = new Hono()

// Enable CORS for client requests (needed in development when client runs on different port)
// Serve static files from client build (production only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/*', cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  }))
}

/**
 * POST /api/add-user - Add or update user profile (without avatar)
 * Preserves existing avatar if user already exists
 */
app.post('/api/add-user', async (c) => {
  try {
    const body = await c.req.json()
    const { profileJwt } = body

    if (!profileJwt) {
      return c.json({ error: 'Missing profileJwt' }, 400)
    }

    // Verify and decode the profile JWT
    const profilePayload = await decodeAndVerifyJWT(profileJwt)

    // Extract profile data
    const { did, name, socials } = profilePayload.data as {
      did: string
      name: string
      socials?: Array<{ platform: string; handle: string }>
    }

    // Upsert user profile (insert if new, update if exists, preserves avatar)
    const user = await UserModel.addOrUpdateUser(
      did,
      name,
      socials ?? []
    )

    // Broadcast to all SSE clients
    broadcastNewUser(user)

    return c.json(user)
  } catch (error) {
    console.error('Add user error:', error)
    return c.json(
      { error: 'Failed to add user', message: (error as Error).message },
      500
    )
  }
})

/**
 * POST /api/add-avatar - Add or update user avatar
 * Creates user with avatar only if doesn't exist yet
 */
app.post('/api/add-avatar', async (c) => {
  try {
    const body = await c.req.json()
    const { avatarJwt } = body

    if (!avatarJwt) {
      return c.json({ error: 'Missing avatarJwt' }, 400)
    }

    // Verify and decode the avatar JWT
    const avatarPayload = await decodeAndVerifyJWT(avatarJwt)

    // Extract DID from issuer and avatar from data
    const did = avatarPayload.iss
    const { avatar } = avatarPayload.data as { avatar: string }

    if (!avatar) {
      return c.json({ error: 'No avatar data in JWT' }, 400)
    }

    // Upsert avatar (insert if new, update if exists, preserves name/socials)
    const user = await UserModel.addOrUpdateUserAvatar(did, avatar)

    // Broadcast to all SSE clients
    broadcastNewUser(user)

    return c.json(user)
  } catch (error) {
    console.error('Add avatar error:', error)
    return c.json(
      { error: 'Failed to add avatar', message: (error as Error).message },
      500
    )
  }
})

/**
 * DELETE /api/remove-user - Remove user from meetup
 * Requires JWT verification to ensure user is removing themselves
 */
app.delete('/api/remove-user', async (c) => {
  try {
    const body = await c.req.json()
    const { profileJwt } = body

    if (!profileJwt) {
      return c.json({ error: 'Missing profileJwt' }, 400)
    }

    // Verify and decode the JWT to get the user's DID
    const payload = await decodeAndVerifyJWT(profileJwt)
    const did = payload.iss

    // Delete the user from the database
    await UserModel.deleteUserByDID(did)

    // Broadcast to all SSE clients
    broadcastUserLeft(did)

    return c.json({ success: true, did })
  } catch (error) {
    console.error('Remove user error:', error)
    return c.json(
      { error: 'Failed to remove user', message: (error as Error).message },
      500
    )
  }
})

/**
 * GET /api/users - Get all users
 */
app.get('/api/users', async (c) => {
  try {
    const users = await UserModel.getAllUsers()
    return c.json({ users })
  } catch (error) {
    console.error('Error fetching users:', error)
    return c.json(
      { error: 'Failed to fetch users', message: (error as Error).message },
      500
    )
  }
})

// Setup SSE endpoint
setupSSERoute(app)

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSSEConnections: getActiveConnectionCount(),
  })
})

// Serve static files from client build (production only)
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './client/dist' }))
  app.get('/*', serveStatic({ path: './client/dist/index.html' }))
}

// Start the server
const port = 3000
console.log(`🚀 Hono server running on http://localhost:${port}`)
console.log(`📡 SSE endpoint: http://localhost:${port}/api/sse`)

serve({
  fetch: app.fetch,
  port,
})
