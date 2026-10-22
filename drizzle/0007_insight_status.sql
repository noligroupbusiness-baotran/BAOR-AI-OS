ALTER TABLE `insights` ADD `status` text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `insights` ADD `origin` text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE `insights` ADD `evidence` text DEFAULT '[]' NOT NULL;