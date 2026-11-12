CREATE TABLE `post_quotes` (
	`postId` text PRIMARY KEY NOT NULL,
	`quoteUri` text NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `post_quotes_quote_uri_idx` ON `post_quotes` (`quoteUri`);