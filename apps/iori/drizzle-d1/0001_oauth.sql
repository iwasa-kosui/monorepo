CREATE TABLE `oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`applicationId` text NOT NULL,
	`userId` text,
	`authorizationCodeHash` text,
	`scopes` text NOT NULL,
	`createdAt` integer NOT NULL,
	`revokedAt` integer,
	`lastUsedAt` integer,
	FOREIGN KEY (`applicationId`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_token_hash_unique` ON `oauth_access_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `oauth_access_tokens_authorization_code_hash_idx` ON `oauth_access_tokens` (`authorizationCodeHash`);--> statement-breakpoint
CREATE TABLE `oauth_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`clientSecretHash` text NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`redirectUris` text NOT NULL,
	`scopes` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_applications_client_id_unique` ON `oauth_applications` (`clientId`);--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`codeHash` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`userId` text NOT NULL,
	`redirectUri` text NOT NULL,
	`scopes` text NOT NULL,
	`codeChallenge` text,
	`codeChallengeMethod` text,
	`expiresAt` integer NOT NULL,
	`consumedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
