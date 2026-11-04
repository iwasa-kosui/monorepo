CREATE TABLE `notification_reposts` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`reposterActorId` text NOT NULL,
	`repostedPostId` text NOT NULL,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reposterActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
