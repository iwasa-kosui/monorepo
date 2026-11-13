CREATE TABLE `user_preferences` (
	`userId` text PRIMARY KEY NOT NULL,
	`defaultPostVisibility` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
