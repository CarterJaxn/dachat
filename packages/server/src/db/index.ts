import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as billingSchema from './schema/billing.js'
import * as chatSchema from './schema/chat.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')

const client = postgres(connectionString)
export const db = drizzle(client, { schema: { ...billingSchema, ...chatSchema } })

export * from './schema/billing.js'
export * from './schema/chat.js'
