CREATE TABLE `ai_translation_usages` (
	`userId` text NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`userId`, `day`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `post_translations` (
	`postId` text NOT NULL,
	`targetLanguage` text NOT NULL,
	`sourceHash` text NOT NULL,
	`content` text NOT NULL,
	`detectedSourceLanguage` text NOT NULL,
	`model` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`postId`, `targetLanguage`),
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE cascade
);
