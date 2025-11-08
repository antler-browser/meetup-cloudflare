import { sql } from 'drizzle-orm'
import { text, index, sqliteTable, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  did: text('did').notNull().primaryKey(),
  name: text('name'),
  avatar: text('avatar'),
  socials: text('socials'), // JSON array of strings: ["platform:handle", "platform:handle"]
  createdAt : integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const usersCreatedAtIndex = index('idx_users_created_at').on(users.createdAt)

// Type inference for TypeScript
export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
