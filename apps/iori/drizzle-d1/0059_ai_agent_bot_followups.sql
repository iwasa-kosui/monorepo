CREATE TABLE `ai_agent_bot_followups` (
	`followupId` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`authorActorId` text NOT NULL,
	`note` text NOT NULL,
	`round` integer NOT NULL,
	`dueAt` integer NOT NULL,
	`scheduledAt` integer NOT NULL,
	`outcome` text,
	`reason` text,
	`handledAt` integer
);
--> statement-breakpoint
CREATE INDEX `ai_agent_bot_followups_handled_at_due_at_idx` ON `ai_agent_bot_followups` (`handledAt`,`dueAt`);--> statement-breakpoint
CREATE INDEX `ai_agent_bot_followups_outcome_handled_at_idx` ON `ai_agent_bot_followups` (`outcome`,`handledAt`);