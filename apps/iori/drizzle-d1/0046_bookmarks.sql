CREATE TABLE `bookmarks` (
	`bookmarkId` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`postId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_actor_post_unique` ON `bookmarks` (`actorId`,`postId`);