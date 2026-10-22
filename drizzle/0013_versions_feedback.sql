CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`version` integer NOT NULL,
	`hook` text DEFAULT '' NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`by` text DEFAULT '' NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_versions_content_version_idx` ON `content_versions` (`content_id`,`version`);--> statement-breakpoint
CREATE TABLE `video_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`by` text DEFAULT '' NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `video_feedback_video_idx` ON `video_feedback` (`video_id`);