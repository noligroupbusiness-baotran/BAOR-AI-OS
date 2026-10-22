CREATE TABLE `video_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`version` integer NOT NULL,
	`t` real NOT NULL,
	`t_end` real,
	`src_t` real NOT NULL,
	`src_t_end` real,
	`text` text NOT NULL,
	`fix` text,
	`status` text DEFAULT 'open' NOT NULL,
	`applied_version` integer,
	`verify_note` text DEFAULT '' NOT NULL,
	`by` text DEFAULT '' NOT NULL,
	`at` text NOT NULL,
	`resolved_by` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `video_comments_video_idx` ON `video_comments` (`video_id`);