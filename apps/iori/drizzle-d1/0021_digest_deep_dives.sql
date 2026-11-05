CREATE TABLE `digest_deep_dive_turns` (
	`turnId` text PRIMARY KEY NOT NULL,
	`deepDiveId` text NOT NULL,
	`turnNumber` integer NOT NULL,
	`instruction` text NOT NULL,
	`resultMarkdown` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`deepDiveId`) REFERENCES `digest_deep_dives`(`deepDiveId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_deep_dive_turns_deep_dive_id_turn_number_unique` ON `digest_deep_dive_turns` (`deepDiveId`,`turnNumber`);--> statement-breakpoint
CREATE TABLE `digest_deep_dive_usages` (
	`userId` text NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`userId`, `day`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `digest_deep_dives` (
	`deepDiveId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`digestItemId` text NOT NULL,
	`articleId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_deep_dives_digest_item_id_unique` ON `digest_deep_dives` (`digestItemId`);