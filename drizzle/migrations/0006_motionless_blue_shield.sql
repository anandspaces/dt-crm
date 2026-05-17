CREATE TYPE "public"."batch_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."queue_item_status" AS ENUM('queued', 'dialing', 'in-progress', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"voice" varchar(100) DEFAULT 'Puck' NOT NULL,
	"system_instruction" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_name" varchar(255) DEFAULT 'Bulk AI Caller' NOT NULL,
	"from_number" varchar(50),
	"status" "batch_status" DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_queue_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lead_id" uuid,
	"position" integer NOT NULL,
	"lead_name" varchar(255),
	"company" varchar(255),
	"phone_number" varchar(50) NOT NULL,
	"email" varchar(255),
	"status" "queue_item_status" DEFAULT 'queued' NOT NULL,
	"request_uuid" varchar(255),
	"vobiz_call_uuid" varchar(255),
	"call_document_id" uuid,
	"recording_id" varchar(255),
	"recording_url" varchar(1024),
	"artifact_key" text,
	"error" text,
	"duration_seconds" integer,
	"sentiment_label" varchar(50),
	"sentiment_score" double precision,
	"summary" text,
	"transcript_text" text,
	"transcript_json" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"file_name" varchar(255),
	"content" text NOT NULL,
	"image_url" varchar(1024),
	"page_number" integer,
	"embedding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "queue_item_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "vobiz_call_uuid" varchar(255);--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "transcript_json" jsonb;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "sentiment_label" varchar(50);--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "sentiment_score" double precision;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_batches" ADD CONSTRAINT "call_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_batches" ADD CONSTRAINT "call_batches_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_queue_items" ADD CONSTRAINT "call_queue_items_batch_id_call_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."call_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_queue_items" ADD CONSTRAINT "call_queue_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_queue_items" ADD CONSTRAINT "call_queue_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_knowledge" ADD CONSTRAINT "rag_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_knowledge" ADD CONSTRAINT "rag_knowledge_agent_id_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agents_user_id_idx" ON "ai_agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "call_batches_user_id_idx" ON "call_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "call_batches_status_idx" ON "call_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cqi_batch_position_idx" ON "call_queue_items" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "cqi_batch_status_idx" ON "call_queue_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "cqi_vobiz_uuid_idx" ON "call_queue_items" USING btree ("vobiz_call_uuid");--> statement-breakpoint
CREATE INDEX "rag_knowledge_agent_id_idx" ON "rag_knowledge" USING btree ("agent_id");--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_batch_id_call_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."call_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_calls_batch_id_idx" ON "lead_calls" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "lead_calls_vobiz_uuid_idx" ON "lead_calls" USING btree ("vobiz_call_uuid");