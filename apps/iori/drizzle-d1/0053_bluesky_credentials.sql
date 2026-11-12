CREATE TABLE `bluesky_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`did` text NOT NULL,
	`handle` text NOT NULL,
	`appPasswordCiphertext` text NOT NULL,
	`appPasswordIv` text NOT NULL,
	`keyVersion` integer NOT NULL,
	`chatPermitted` integer,
	`verifiedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
