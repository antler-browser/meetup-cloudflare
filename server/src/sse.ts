/**
 * Server-Sent Events (SSE) module for real-time meetup user updates
 */

import type { Hono } from 'hono'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type User } from './db/schema.js'

/**
 * SSE event type constants
 */
export enum SSEEventType {
  CONNECTED = 'connected',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  HEARTBEAT = 'heartbeat',
  MEETUP_ENDED = 'meetup-ended',
}

const HEARTBEAT_INTERVAL_MS = 10000 // 10 seconds (Railway closes idle SSE connections after ~14s)

/**
 * Build a connection established event
 */
function buildConnectedEvent() {
  return {
    event: SSEEventType.CONNECTED,
    data: JSON.stringify({ message: 'Connected to SSE' }),
  }
}

/**
 * Build a user joined event
 */
function buildUserJoinedEvent(user: User) {
  return {
    event: SSEEventType.USER_JOINED,
    data: JSON.stringify(user)
  }
}

/**
 * Build a user left event
 */
function buildUserLeftEvent(did: string) {
  return {
    event: SSEEventType.USER_LEFT,
    data: JSON.stringify({ did })
  }
}

/**
 * Build a heartbeat event
 */
function buildHeartbeatEvent() {
  return {
    event: SSEEventType.HEARTBEAT,
    data: JSON.stringify({ timestamp: Date.now() }),
  }
}

/**
 * Build an event ended notification
 */
function buildMeetupEndedEvent() {
  return {
    event: SSEEventType.MEETUP_ENDED,
    data: JSON.stringify({ message: 'Meetup has ended' }),
  }
}

// SSE clients storage - stores callbacks for each connected client
const sseClients = new Set<(eventData: { event: SSEEventType; data: string }) => void>()

/**
 * Broadcast an event to all connected SSE clients
 */
function broadcastToAllClients(eventData: { event: SSEEventType; data: string }) {
  sseClients.forEach((sendEvent) => {
    try {
      sendEvent(eventData)
    } catch (error) {
      console.error('Error broadcasting to client:', error)
    }
  })
}

/**
 * Broadcast new user to all connected SSE clients
 */
export function broadcastNewUser(user: User) {
  broadcastToAllClients(buildUserJoinedEvent(user))
}

/**
 * Broadcast user left to all connected SSE clients
 */
export function broadcastUserLeft(did: string) {
  broadcastToAllClients(buildUserLeftEvent(did))
}

/**
 * Broadcast event ended notification to all connected SSE clients
 */
export function broadcastMeetupEnded() {
  broadcastToAllClients(buildMeetupEndedEvent())
}

/**
 * Get the number of active SSE connections
 */
export function getActiveConnectionCount(): number {
  return sseClients.size
}

/**
 * Setup SSE route on the Hono app
 * GET /api/sse - Server-Sent Events endpoint for real-time updates
 */
export function setupSSERoute(app: Hono) {
  app.get('/api/sse', (c: Context) => {
    return streamSSE(c, async (stream) => {
      // Send initial connection message
      await stream.writeSSE(buildConnectedEvent())

      // Create a callback for this client to receive all event types
      const sendEvent = (eventData: { event: SSEEventType; data: string }) => {
        stream.writeSSE(eventData).catch((err) => {
          console.error('Error sending SSE:', err)
        })
      }

      // Add this client to the set
      sseClients.add(sendEvent)

      // Keep the connection alive with heartbeats
      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.writeSSE(buildHeartbeatEvent())
        } catch (err) {
          console.error('Heartbeat failed:', err)
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Clean up when client disconnects
      c.req.raw.signal.addEventListener('abort', () => {
        console.log('SSE client disconnected')
        sseClients.delete(sendEvent)
        clearInterval(heartbeatInterval)
      })

      // Keep the stream open
      await stream.sleep(14400000) // 4 hours
    })
  })
}
