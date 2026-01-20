-- Migration: objectUri -> postId for likes, likes_v2, reposts, emoji_reacts tables

-- 1. likesテーブル: objectUri -> postId
ALTER TABLE likes ADD COLUMN post_id UUID;

UPDATE likes l
SET post_id = rp.post_id
FROM remote_posts rp
WHERE l.object_uri = rp.uri;

-- 移行できなかったレコードを削除（リモート投稿が存在しない場合）
DELETE FROM likes WHERE post_id IS NULL;

ALTER TABLE likes DROP CONSTRAINT actor_object_unique;
ALTER TABLE likes DROP COLUMN object_uri;
ALTER TABLE likes ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE likes ADD CONSTRAINT likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(post_id);
ALTER TABLE likes ADD CONSTRAINT like_actor_post_unique UNIQUE (actor_id, post_id);

-- 2. likes_v2テーブル: objectUri -> postId
ALTER TABLE likes_v2 ADD COLUMN post_id UUID;

UPDATE likes_v2 l
SET post_id = rp.post_id
FROM remote_posts rp
WHERE l.object_uri = rp.uri;

-- 移行できなかったレコードを削除
DELETE FROM likes_v2 WHERE post_id IS NULL;

ALTER TABLE likes_v2 DROP CONSTRAINT likes_v2_actor_object_unique;
ALTER TABLE likes_v2 DROP COLUMN object_uri;
ALTER TABLE likes_v2 ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE likes_v2 ADD CONSTRAINT likes_v2_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(post_id);
ALTER TABLE likes_v2 ADD CONSTRAINT likes_v2_actor_post_unique UNIQUE (actor_id, post_id);

-- 3. repostsテーブル: objectUri, originalPostId -> postId
ALTER TABLE reposts ADD COLUMN post_id_new UUID;

-- まずoriginalPostIdがある場合はそれを使用
UPDATE reposts
SET post_id_new = original_post_id
WHERE original_post_id IS NOT NULL;

-- originalPostIdがない場合はobjectUriからpostIdを取得
UPDATE reposts r
SET post_id_new = rp.post_id
FROM remote_posts rp
WHERE r.object_uri = rp.uri AND r.post_id_new IS NULL;

-- 移行できなかったレコードを削除
DELETE FROM reposts WHERE post_id_new IS NULL;

ALTER TABLE reposts DROP CONSTRAINT repost_actor_object_unique;
ALTER TABLE reposts DROP COLUMN object_uri;
ALTER TABLE reposts DROP COLUMN original_post_id;
ALTER TABLE reposts RENAME COLUMN post_id_new TO post_id;
ALTER TABLE reposts ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE reposts ADD CONSTRAINT reposts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(post_id);
ALTER TABLE reposts ADD CONSTRAINT repost_actor_post_unique UNIQUE (actor_id, post_id);

-- 4. emoji_reactsテーブル: objectUri -> postId
ALTER TABLE emoji_reacts ADD COLUMN post_id UUID;

UPDATE emoji_reacts e
SET post_id = rp.post_id
FROM remote_posts rp
WHERE e.object_uri = rp.uri;

-- 移行できなかったレコードを削除
DELETE FROM emoji_reacts WHERE post_id IS NULL;

ALTER TABLE emoji_reacts DROP CONSTRAINT emoji_react_actor_object_emoji_unique;
ALTER TABLE emoji_reacts DROP COLUMN object_uri;
ALTER TABLE emoji_reacts ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE emoji_reacts ADD CONSTRAINT emoji_reacts_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(post_id);
ALTER TABLE emoji_reacts ADD CONSTRAINT emoji_react_actor_post_emoji_unique UNIQUE (actor_id, post_id, emoji);
