CREATE TABLE `interest_sources` (
	`interestSourceId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`contentHash` text NOT NULL,
	`weight` real NOT NULL,
	`occurredAt` integer NOT NULL,
	`embedding` blob,
	`embeddedAt` integer,
	`deletedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_sources_user_id_kind_ref_unique` ON `interest_sources` (`userId`,`kind`,`ref`);--> statement-breakpoint
CREATE INDEX `interest_sources_user_id_embedded_at_deleted_at_idx` ON `interest_sources` (`userId`,`embeddedAt`,`deletedAt`);