CREATE TABLE `improvement_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`target` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`sample_size` integer DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'low' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `improvement_proposals_key_idx` ON `improvement_proposals` (`key`);