CREATE TABLE `bluesky_likes` (
	`subjectUri` text PRIMARY KEY NOT NULL,
	`likeUri` text NOT NULL,
	`createdAt` integer NOT NULL
);
