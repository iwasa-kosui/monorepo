-- Migration: Integrate Like/LikeV2 dual models
-- This migration unifies the likes and likes_v2 tables into a single base table
-- with local_likes and remote_likes derived tables (same pattern as posts table)

-- Step 1: Add type column to likes table
ALTER TABLE "likes" ADD COLUMN "type" varchar(32);

-- Set all existing likes as 'local' type
UPDATE "likes" SET "type" = 'local' WHERE "type" IS NULL;

-- Make type column NOT NULL
ALTER TABLE "likes" ALTER COLUMN "type" SET NOT NULL;

--> statement-breakpoint

-- Step 2: Create local_likes table
CREATE TABLE "local_likes" (
	"likeId" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_likes" ADD CONSTRAINT "local_likes_likeId_likes_likeId_fk" FOREIGN KEY ("likeId") REFERENCES "public"."likes"("likeId") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

-- Step 3: Create remote_likes table
CREATE TABLE "remote_likes" (
	"likeId" uuid PRIMARY KEY NOT NULL,
	"likeActivityUri" text NOT NULL,
	CONSTRAINT "remote_likes_likeActivityUri_unique" UNIQUE("likeActivityUri")
);
--> statement-breakpoint
ALTER TABLE "remote_likes" ADD CONSTRAINT "remote_likes_likeId_likes_likeId_fk" FOREIGN KEY ("likeId") REFERENCES "public"."likes"("likeId") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

-- Step 4: Migrate existing likes data to local_likes
INSERT INTO "local_likes" ("likeId")
SELECT "likeId" FROM "likes" WHERE "type" = 'local';

--> statement-breakpoint

-- Step 5: Migrate likes_v2 data to likes and remote_likes tables
-- Only migrate records that don't conflict with existing likes (actorId, postId unique constraint)
INSERT INTO "likes" ("likeId", "actorId", "postId", "type", "createdAt")
SELECT v."likeId", v."actorId", v."postId", 'remote', v."createdAt"
FROM "likes_v2" v
WHERE NOT EXISTS (
  SELECT 1 FROM "likes" l
  WHERE l."actorId" = v."actorId" AND l."postId" = v."postId"
);

--> statement-breakpoint

-- Migrate likes_v2 data to remote_likes (only for successfully migrated records)
INSERT INTO "remote_likes" ("likeId", "likeActivityUri")
SELECT v."likeId", v."likeActivityUri"
FROM "likes_v2" v
WHERE EXISTS (
  SELECT 1 FROM "likes" l
  WHERE l."likeId" = v."likeId"
);

--> statement-breakpoint

-- Step 6: Drop likes_v2 table (after confirming migration success)
-- This step removes the deprecated likes_v2 table
DROP TABLE "likes_v2";
