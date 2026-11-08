CREATE TABLE `digest_x_posts` (
	`digestId` text NOT NULL,
	`rank` integer NOT NULL,
	`feedEntryId` text NOT NULL,
	PRIMARY KEY(`digestId`, `rank`),
	FOREIGN KEY (`digestId`) REFERENCES `digests`(`digestId`) ON UPDATE no action ON DELETE no action
);
