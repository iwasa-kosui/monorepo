CREATE TABLE `remote_post_polls` (
	`postId` text PRIMARY KEY NOT NULL,
	`multiple` integer NOT NULL,
	`options` text NOT NULL,
	`votersCount` integer,
	`expiresAt` integer,
	`closed` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
