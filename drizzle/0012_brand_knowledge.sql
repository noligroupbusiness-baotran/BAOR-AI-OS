CREATE TABLE `content_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`content_id` text,
	`topic` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`key_message` text DEFAULT '' NOT NULL,
	`angle` text DEFAULT '' NOT NULL,
	`points` text DEFAULT '[]' NOT NULL,
	`gaps` text DEFAULT '[]' NOT NULL,
	`qa` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_index` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`source_grade` text DEFAULT '' NOT NULL,
	`notion_edited_at` text,
	`body` text DEFAULT '' NOT NULL,
	`body_hash` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'notion_sync' NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_index_status_idx` ON `knowledge_index` (`status`);--> statement-breakpoint
CREATE TABLE `research_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`statement` text NOT NULL,
	`classification` text NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`knowledge_ids` text DEFAULT '[]' NOT NULL,
	`counter_view` text DEFAULT '' NOT NULL,
	`limits` text DEFAULT '' NOT NULL,
	`application` text DEFAULT '' NOT NULL,
	`content_topics` text DEFAULT '[]' NOT NULL,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`verify_ok` integer DEFAULT false NOT NULL,
	`verify_notes` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_findings_task_idx` ON `research_findings` (`task_id`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`publisher` text DEFAULT '' NOT NULL,
	`published_at` text,
	`source_type` text DEFAULT 'other' NOT NULL,
	`grade` text DEFAULT 'C' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`limits` text DEFAULT '' NOT NULL,
	`accessed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_sources_task_idx` ON `research_sources` (`task_id`);--> statement-breakpoint
CREATE TABLE `research_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`purpose_kind` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`content_id` text,
	`campaign_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`runner` text DEFAULT 'ai' NOT NULL,
	`model` text,
	`search_count` integer DEFAULT 0 NOT NULL,
	`cost_vnd` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`error` text,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `research_tasks_created_idx` ON `research_tasks` (`created_at`);--> statement-breakpoint
CREATE VIRTUAL TABLE `knowledge_fts` USING fts5(`id` UNINDEXED, `title`, `body`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT OR IGNORE INTO `integrations` (`key`, `name`, `description`, `connected`, `account`, `config`) VALUES ('notion', 'Notion (Second Brain)', 'Đọc kho tri thức BAOR TRAN để truy xuất kiến thức cho nghiên cứu và nội dung. Chỉ đọc; Notion là nguồn chuẩn.', 0, NULL, '{}');
