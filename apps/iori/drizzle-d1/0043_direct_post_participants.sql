CREATE TABLE `direct_post_participants` (
	`postId` text NOT NULL,
	`actorUri` text NOT NULL,
	PRIMARY KEY(`postId`, `actorUri`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `direct_post_participants_actor_uri_idx` ON `direct_post_participants` (`actorUri`);
--> statement-breakpoint
INSERT OR IGNORE INTO `direct_post_participants` (`postId`, `actorUri`) SELECT `remote_posts`.`postId`, `actors`.`uri` FROM `remote_posts` INNER JOIN `posts` ON `posts`.`postId` = `remote_posts`.`postId` INNER JOIN `actors` ON `actors`.`actorId` = `posts`.`actorId` WHERE `remote_posts`.`visibility` = 'direct';
--> statement-breakpoint
INSERT OR IGNORE INTO `direct_post_participants` (`postId`, `actorUri`) SELECT `remote_post_recipients`.`postId`, `remote_post_recipients`.`actorUri` FROM `remote_post_recipients` INNER JOIN `remote_posts` ON `remote_posts`.`postId` = `remote_post_recipients`.`postId` WHERE `remote_posts`.`visibility` = 'direct';
