import { getAllPosts } from "@/lib/posts";
import { PostCard } from "@/components/PostCard";

export function Home() {
  const posts = getAllPosts();

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Posts</h1>
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
        {posts.length === 0 && (
          <p className="text-muted-foreground">No posts yet.</p>
        )}
      </div>
    </div>
  );
}
