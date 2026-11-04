CREATE TABLE `digest_topics` (
	`userId` text NOT NULL,
	`topicKey` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`embedding` blob,
	`embeddedAt` integer,
	`sortOrder` integer NOT NULL,
	`enabled` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `topicKey`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `digests_user_id_digest_date_unique`;--> statement-breakpoint
ALTER TABLE `digests` ADD `topicKey` text DEFAULT 'summary' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `digests_user_id_digest_date_topic_key_unique` ON `digests` (`userId`,`digestDate`,`topicKey`);