CREATE TABLE `remote_post_poll_votes` (
	`postId` text NOT NULL,
	`actorId` text NOT NULL,
	`choice` integer NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`postId`, `actorId`, `choice`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
