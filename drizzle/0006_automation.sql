CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`trigger` text NOT NULL,
	`condition` text DEFAULT '{}' NOT NULL,
	`action` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`requires_approval` integer DEFAULT false NOT NULL,
	`campaign_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`last_run_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`at` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`ok` integer DEFAULT true NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`decision_id` text
);
--> statement-breakpoint
CREATE INDEX `automation_runs_rule_idx` ON `automation_runs` (`rule_id`);--> statement-breakpoint
CREATE INDEX `automation_runs_at_idx` ON `automation_runs` (`at`);--> statement-breakpoint
CREATE TABLE `faqs` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`answer` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
