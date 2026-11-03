CREATE TABLE `mastodon_markers` (
	`userId` text NOT NULL,
	`timeline` text NOT NULL,
	`lastReadId` text NOT NULL,
	`version` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `timeline`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_user_id_created_at_notification_id_idx` ON `notifications` (`recipientUserId`,`createdAt`,`notificationId`);