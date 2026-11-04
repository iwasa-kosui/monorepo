ALTER TABLE `posts` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `sensitive` integer DEFAULT false NOT NULL;