CREATE TABLE `blocks` (
	`blockId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`blockedActorId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blockedActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_user_actor_unique` ON `blocks` (`userId`,`blockedActorId`);--> statement-breakpoint
CREATE INDEX `blocks_user_id_idx` ON `blocks` (`userId`);--> statement-breakpoint
CREATE INDEX `blocks_blocked_actor_id_idx` ON `blocks` (`blockedActorId`);