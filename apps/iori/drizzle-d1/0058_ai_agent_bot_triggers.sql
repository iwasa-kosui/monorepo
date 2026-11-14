CREATE TABLE `ai_agent_bot_triggers` (
	`postId` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`handledAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_agent_bot_triggers_outcome_handled_at_idx` ON `ai_agent_bot_triggers` (`outcome`,`handledAt`);