CREATE TABLE `ad_spend_daily` (
	`ad_id` text NOT NULL,
	`date` text NOT NULL,
	`spend` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`leads` integer DEFAULT 0 NOT NULL,
	`thruplays` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_spend_daily_ad_date_idx` ON `ad_spend_daily` (`ad_id`,`date`);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `video_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `post_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `audience_json` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `start_at` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `end_at` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `meta_campaign_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `meta_adset_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `meta_creative_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `meta_ad_id` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `insights_at` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `created_by` text;