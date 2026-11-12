CREATE TABLE `passkey_credentials` (
	`credentialId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`publicKey` text NOT NULL,
	`counter` integer NOT NULL,
	`transports` text NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` integer NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer
);
--> statement-breakpoint
CREATE INDEX `passkey_credentials_user_id_idx` ON `passkey_credentials` (`userId`);--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`challengeId` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`purpose` text NOT NULL,
	`userId` text,
	`expires` integer NOT NULL
);
