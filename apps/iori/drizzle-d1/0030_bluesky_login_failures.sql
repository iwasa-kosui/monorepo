CREATE TABLE `bluesky_login_failures` (
	`scope` text PRIMARY KEY NOT NULL,
	`failedAt` integer NOT NULL
);
