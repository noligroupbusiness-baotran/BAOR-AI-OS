CREATE TABLE `hook_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`hook` text NOT NULL,
	`angle` text DEFAULT '' NOT NULL,
	`beats` text DEFAULT '[]' NOT NULL,
	`duration_sec` integer DEFAULT 60 NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`basis` text DEFAULT '[]' NOT NULL,
	`policy_issues` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`content_id` text,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
