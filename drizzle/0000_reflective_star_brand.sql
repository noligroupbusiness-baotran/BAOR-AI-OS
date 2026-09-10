CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`step` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ad_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`daily_budget` integer NOT NULL,
	`spent` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`leads` integer DEFAULT 0 NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`content_id` text,
	`started_at` text,
	`ai_note` text
);
--> statement-breakpoint
CREATE TABLE `auto_reply_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`action` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`insight_id` text,
	`pillar` text DEFAULT '' NOT NULL,
	`hook` text DEFAULT '' NOT NULL,
	`outline` text DEFAULT '[]' NOT NULL,
	`draft` text,
	`assignee` text DEFAULT 'ai' NOT NULL,
	`scheduled_for` text,
	`created_at` text NOT NULL,
	`score` integer,
	`source` text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`lead_name` text NOT NULL,
	`platform` text NOT NULL,
	`needs_human` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`sent_at` text,
	`status` text NOT NULL,
	`recipients` integer DEFAULT 0 NOT NULL,
	`open_rate` real,
	`click_rate` real
);
--> statement-breakpoint
CREATE TABLE `email_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`trigger` text NOT NULL,
	`steps` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`subscribers` integer DEFAULT 0 NOT NULL,
	`open_rate` real DEFAULT 0 NOT NULL,
	`click_rate` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`persona_id` text,
	`created_at` text NOT NULL,
	`used_in_content` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`connected` integer DEFAULT false NOT NULL,
	`account` text,
	`config` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`platform` text NOT NULL,
	`stage` text NOT NULL,
	`last_message` text DEFAULT '' NOT NULL,
	`last_message_at` text NOT NULL,
	`phone` text,
	`email` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`auto_replied` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`from` text NOT NULL,
	`text` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age_range` text DEFAULT '' NOT NULL,
	`occupation` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`goals` text DEFAULT '[]' NOT NULL,
	`pain_points` text DEFAULT '[]' NOT NULL,
	`objections` text DEFAULT '[]' NOT NULL,
	`channels` text DEFAULT '[]' NOT NULL,
	`share` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_research` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`updated_at` text NOT NULL,
	`audience_fit` integer DEFAULT 0 NOT NULL,
	`trending_topics` text DEFAULT '[]' NOT NULL,
	`best_posting_times` text DEFAULT '[]' NOT NULL,
	`content_formats` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`title` text NOT NULL,
	`platform` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text NOT NULL,
	`reach` integer,
	`engagement` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
