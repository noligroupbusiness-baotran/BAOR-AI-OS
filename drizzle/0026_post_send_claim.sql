ALTER TABLE `scheduled_posts` ADD `claimed_by` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `claimed_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_posts` ADD `lock_released_note` text;