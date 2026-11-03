CREATE TABLE `remote_post_recipients` (
	`postId` text NOT NULL,
	`actorUri` text NOT NULL,
	PRIMARY KEY(`postId`, `actorUri`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `remote_post_recipients_actor_uri_idx` ON `remote_post_recipients` (`actorUri`);