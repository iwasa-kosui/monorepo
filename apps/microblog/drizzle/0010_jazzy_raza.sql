ALTER TABLE "emoji_reacts" ADD COLUMN "emojiImageUrl" text;--> statement-breakpoint
ALTER TABLE "local_posts" ADD COLUMN "inReplyToUri" text;--> statement-breakpoint
ALTER TABLE "notification_emoji_reacts" ADD COLUMN "emojiImageUrl" text;--> statement-breakpoint
ALTER TABLE "remote_posts" ADD COLUMN "inReplyToUri" text;