CREATE TABLE `security_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`backup_codes` text DEFAULT '[]' NOT NULL,
	`session_version` integer DEFAULT 1 NOT NULL,
	`last_login_at` text,
	`last_login_ip` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_events_email_at_idx` ON `security_events` (`email`,`at`);--> statement-breakpoint
CREATE INDEX `security_events_at_idx` ON `security_events` (`at`);