CREATE TABLE `campaign_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`channel_goal_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaign_approvals_campaign_idx` ON `campaign_approvals` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `campaign_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`idem_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_logs_idem_uq` ON `campaign_logs` (`idem_key`);--> statement-breakpoint
CREATE INDEX `campaign_logs_campaign_idx` ON `campaign_logs` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `campaign_results` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`achieved_value` integer DEFAULT 0 NOT NULL,
	`leads` integer DEFAULT 0 NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`revenue` integer DEFAULT 0 NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`source` text DEFAULT 'sample' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`objective` text NOT NULL,
	`target_metric` text DEFAULT '' NOT NULL,
	`target_value` integer,
	`product_ids` text DEFAULT '[]' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_budget` integer DEFAULT 0 NOT NULL,
	`budget_note` text DEFAULT '' NOT NULL,
	`owner_id` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text
);
--> statement-breakpoint
CREATE TABLE `channel_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`channel` text NOT NULL,
	`account_id` text,
	`execution_type` text NOT NULL,
	`objective` text NOT NULL,
	`primary_metric` text NOT NULL,
	`target_value` integer DEFAULT 0 NOT NULL,
	`current_value` integer DEFAULT 0 NOT NULL,
	`budget` integer DEFAULT 0 NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	`owner_id` text NOT NULL,
	`status` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `channel_goals_campaign_idx` ON `channel_goals` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `marketing_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`channel_goal_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`owner_id` text,
	`via_type` text,
	`via_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_links_entity_uq` ON `marketing_links` (`campaign_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `marketing_links_campaign_idx` ON `marketing_links` (`campaign_id`);