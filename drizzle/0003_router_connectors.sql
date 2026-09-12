CREATE TABLE `ai_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_vnd` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `marketing_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`lane` text NOT NULL,
	`domain` text NOT NULL,
	`subject` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`campaign_id` text,
	`outcome` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`confidence` integer,
	`sources` text DEFAULT '[]' NOT NULL,
	`needs_approval` integer DEFAULT false NOT NULL,
	`ai_call_id` text
);
--> statement-breakpoint
CREATE INDEX `marketing_decisions_at_idx` ON `marketing_decisions` (`at`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_key` text NOT NULL,
	`kind` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`ok` integer DEFAULT false NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`items` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_runs_started_idx` ON `sync_runs` (`started_at`);--> statement-breakpoint
ALTER TABLE `integrations` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `integrations` ADD `last_check_ok` integer;--> statement-breakpoint
ALTER TABLE `integrations` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `integrations` ADD `last_sync_at` text;