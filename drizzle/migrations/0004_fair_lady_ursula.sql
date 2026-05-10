CREATE TYPE "public"."call_outcome" AS ENUM('connected', 'missed', 'voicemail');--> statement-breakpoint
CREATE TYPE "public"."caller_type" AS ENUM('agent', 'ai');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('99ACRES', 'MAGICBRICKS', 'HOUSING', 'JUSTDIAL', 'META_ADS', 'GOOGLE_ADS', 'REFERRAL', 'WALK_IN', 'LINKEDIN', 'WEBSITE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('them', 'you', 'ai');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('UPI', 'CARD', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."timeline_kind" AS ENUM('ai', 'success', 'note', 'info', 'danger');--> statement-breakpoint
CREATE TABLE "lead_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"caller_type" "caller_type" DEFAULT 'agent' NOT NULL,
	"caller_name" varchar(255),
	"outcome" "call_outcome" NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"recording_url" varchar(1024),
	"ai_summary_json" jsonb,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"name" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"url" varchar(2048) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"direction" "message_direction" NOT NULL,
	"text" text NOT NULL,
	"is_ai" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"auto_reminder_enabled" boolean DEFAULT false NOT NULL,
	"next_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'fresh'::text;--> statement-breakpoint
DROP TYPE "public"."lead_status";--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('fresh', 'contacted', 'interested', 'appointment', 'demo', 'negotiation', 'won', 'lost', 'not_interested');--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'fresh'::"public"."lead_status";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DATA TYPE "public"."lead_status" USING "status"::"public"."lead_status";--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "score" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "hot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_enriched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "city" varchar(255);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "budget" varchar(100);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "requirement" varchar(255);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_messages" ADD CONSTRAINT "lead_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_messages" ADD CONSTRAINT "lead_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_payments" ADD CONSTRAINT "lead_payments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_reminders" ADD CONSTRAINT "lead_reminders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_reminders" ADD CONSTRAINT "lead_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_calls_lead_id_idx" ON "lead_calls" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_calls_called_at_idx" ON "lead_calls" USING btree ("called_at");--> statement-breakpoint
CREATE INDEX "lead_documents_lead_id_idx" ON "lead_documents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_messages_lead_id_idx" ON "lead_messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_messages_sent_at_idx" ON "lead_messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "lead_payments_lead_id_idx" ON "lead_payments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_reminders_lead_id_idx" ON "lead_reminders" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_reminders_due_at_idx" ON "lead_reminders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "leads_hot_idx" ON "leads" USING btree ("hot");--> statement-breakpoint
CREATE INDEX "leads_next_reminder_at_idx" ON "leads" USING btree ("next_reminder_at");