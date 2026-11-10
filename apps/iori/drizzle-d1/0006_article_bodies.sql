CREATE TABLE `article_bodies` (
	`articleId` text PRIMARY KEY NOT NULL,
	`privateHtml` text NOT NULL,
	`publicHtml` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`articleId`) REFERENCES `articles`(`articleId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_articles` (
	`articleId` text PRIMARY KEY NOT NULL,
	`authorActorId` text NOT NULL,
	`authorUserId` text NOT NULL,
	`rootPostId` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`publishedAt` integer,
	`unpublishedAt` integer,
	FOREIGN KEY (`authorActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorUserId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rootPostId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_articles`("articleId", "authorActorId", "authorUserId", "rootPostId", "title", "status", "createdAt", "publishedAt", "unpublishedAt") SELECT "articleId", "authorActorId", "authorUserId", "rootPostId", "title", "status", "createdAt", "publishedAt", "unpublishedAt" FROM `articles`;--> statement-breakpoint
DROP TABLE `articles`;--> statement-breakpoint
ALTER TABLE `__new_articles` RENAME TO `articles`;--> statement-breakpoint
CREATE INDEX `articles_author_actor_id_idx` ON `articles` (`authorActorId`);--> statement-breakpoint
CREATE INDEX `articles_root_post_id_idx` ON `articles` (`rootPostId`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_root_post_unique` ON `articles` (`rootPostId`);