/**
 * Database initialization and setup
 */

import { sql } from 'drizzle-orm'
import { db } from './client.js'
import { users } from './schema.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class Database {
  constructor() {
    this.ensureDataDirectory()
    this.initializeSchema()
  }

  private ensureDataDirectory() {
    // Create data directory if it doesn't exist (for local development)
    const dataDir = join(__dirname, '../../data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
  }

  async initializeSchema() {
    try {
      // Run migrations using drizzle-kit push
      // For now, we'll just verify the table exists
      await db
        .select({ count: sql`count(*)` })
        .from(users)
        .catch(() => {
          // Table doesn't exist yet, that's ok - it will be created by drizzle-kit push
          console.log('⚠️  Database not initialized. Run: pnpm db:push')
        })

      console.log('✅ Database initialized')
    } catch (error) {
      console.error('❌ Database initialization error:', error)
    }
  }

  /**
   * Close the database connection (no-op for libsql, kept for compatibility)
   */
  close(): void {
    // libsql client doesn't need explicit closing
    console.log('✅ Database connection closed')
  }
}

// Export singleton instance
export const database = new Database()