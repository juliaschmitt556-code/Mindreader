import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { Pool } from "pg";

export const conversations = pgTable("replymind_conversations", {
  visitorId: text("visitor_id").notNull(),
  id: text("id").notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.visitorId, table.id] }) }));

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema: { conversations } });
