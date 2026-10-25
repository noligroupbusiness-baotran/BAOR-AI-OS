ALTER TABLE `videos` ADD `origin` text DEFAULT 'ai_edit' NOT NULL;--> statement-breakpoint
ALTER TABLE `videos` ADD `files_purged_at` text;