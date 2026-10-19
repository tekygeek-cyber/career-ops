CREATE TABLE "applications" (
	"id" serial PRIMARY KEY,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"location" text DEFAULT '',
	"source" text DEFAULT '',
	"status" text DEFAULT 'Evaluated' NOT NULL,
	"score" text DEFAULT '',
	"url" text DEFAULT '',
	"pdf" text DEFAULT '',
	"report" text DEFAULT '',
	"notes" text DEFAULT '',
	"next_action" text DEFAULT '',
	"applied_at" date,
	"follow_up_at" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" serial PRIMARY KEY,
	"application_id" integer,
	"due_at" date NOT NULL,
	"channel" text DEFAULT 'email',
	"note" text DEFAULT '',
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_application_id_applications_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE;