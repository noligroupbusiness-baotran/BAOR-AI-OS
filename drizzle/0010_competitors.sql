CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`positioning` text DEFAULT '' NOT NULL,
	`channels` text DEFAULT '[]' NOT NULL,
	`offers` text DEFAULT '[]' NOT NULL,
	`strengths` text DEFAULT '[]' NOT NULL,
	`weaknesses` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`last_checked_at` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
