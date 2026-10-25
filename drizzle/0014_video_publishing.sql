ALTER TABLE `scheduled_posts` ADD `video_id` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `caption` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `thumbnail_upload_id` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `permalink` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `verified_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `views` integer;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `metrics_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `mode` text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_posts_dedupe_key_unique` ON `scheduled_posts` (`dedupe_key`);