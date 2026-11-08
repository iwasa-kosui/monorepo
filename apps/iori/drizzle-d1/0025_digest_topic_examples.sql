ALTER TABLE `digest_topics` ADD `examples` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `digest_topics` ADD `excludes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `digest_topics` ADD `excludeEmbedding` blob;