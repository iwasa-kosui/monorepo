CREATE INDEX `federated_timeline_items_received_at_id_idx` ON `federated_timeline_items` (`receivedAt`,`federatedTimelineItemId`);--> statement-breakpoint
CREATE INDEX `local_posts_in_reply_to_uri_idx` ON `local_posts` (`inReplyToUri`);--> statement-breakpoint
CREATE INDEX `posts_created_at_post_id_idx` ON `posts` (`createdAt`,`postId`);--> statement-breakpoint
CREATE INDEX `remote_posts_in_reply_to_uri_idx` ON `remote_posts` (`inReplyToUri`);--> statement-breakpoint
CREATE INDEX `timeline_items_created_at_id_idx` ON `timeline_items` (`createdAt`,`timelineItemId`);