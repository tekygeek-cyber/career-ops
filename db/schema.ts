import { pgTable, serial, text, boolean, timestamp, date, integer } from "drizzle-orm/pg-core";

export const applications = pgTable("applications", {
  id: serial().primaryKey(),
  company: text().notNull(),
  role: text().notNull(),
  location: text().default(""),
  source: text().default(""),
  status: text().notNull().default("Evaluated"),
  score: text().default(""),
  url: text().default(""),
  pdf: text().default(""),
  report: text().default(""),
  notes: text().default(""),
  nextAction: text("next_action").default(""),
  appliedAt: date("applied_at"),
  followUpAt: date("follow_up_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const followUps = pgTable("follow_ups", {
  id: serial().primaryKey(),
  applicationId: integer("application_id").references(() => applications.id, {
    onDelete: "cascade",
  }),
  dueAt: date("due_at").notNull(),
  channel: text().default("email"),
  note: text().default(""),
  done: boolean().notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
