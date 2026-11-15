CREATE TABLE `ai_agent_bot_memories` (
	`memoryId` text PRIMARY KEY NOT NULL,
	`subjectActorId` text,
	`content` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_agent_bot_memories_subject_actor_id_updated_at_idx` ON `ai_agent_bot_memories` (`subjectActorId`,`updatedAt`);