CREATE TABLE `bluesky_chat_push_receipts` (
	`convoId` text PRIMARY KEY NOT NULL,
	`lastMessageId` text NOT NULL,
	`notifiedAt` integer NOT NULL
);
