CREATE TABLE `bluesky_moderated_actors` (
	`did` text PRIMARY KEY NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`blockUri` text,
	`updatedAt` integer NOT NULL
);
