CREATE TABLE `media_uploads` (
	`mediaId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`url` text NOT NULL,
	`mimeType` text NOT NULL,
	`description` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_uploads_user_id_idx` ON `media_uploads` (`userId`);