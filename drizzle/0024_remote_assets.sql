CREATE TABLE `remote_asset_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`file` text NOT NULL,
	`sha256` text NOT NULL,
	`action` text NOT NULL,
	`by` text NOT NULL,
	`by_name` text DEFAULT '' NOT NULL,
	`at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_at` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `remote_asset_decisions_status_idx` ON `remote_asset_decisions` (`status`);--> statement-breakpoint
CREATE TABLE `remote_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`preview_sha` text,
	`preview_type` text,
	`first_seen_at` text NOT NULL,
	`synced_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE INDEX `remote_assets_kind_idx` ON `remote_assets` (`kind`);