CREATE TABLE `bluesky_reposts` (
	`subjectUri` text PRIMARY KEY NOT NULL,
	`repostUri` text NOT NULL,
	`createdAt` integer NOT NULL
);
