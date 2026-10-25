CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`lead_name` text DEFAULT '' NOT NULL,
	`campaign_id` text,
	`channel_goal_id` text,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_campaign_idx` ON `orders` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `orders_lead_idx` ON `orders` (`lead_id`);