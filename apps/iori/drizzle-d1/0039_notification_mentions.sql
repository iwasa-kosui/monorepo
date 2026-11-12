CREATE TABLE `notification_mentions` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`recipientUserId` text NOT NULL,
	`mentionerActorId` text NOT NULL,
	`mentionPostId` text NOT NULL,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentionerActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_mentions_recipient_post_unique` ON `notification_mentions` (`recipientUserId`,`mentionPostId`);--> statement-breakpoint
CREATE INDEX `notification_mentions_mention_post_id_idx` ON `notification_mentions` (`mentionPostId`);