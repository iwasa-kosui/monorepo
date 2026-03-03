import { Link } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription, Badge } from "@iwasa-kosui/ui";
import type { PostMeta } from "@/lib/posts";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link to={`/posts/${post.slug}`} className="block no-underline">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <time dateTime={post.date}>{post.date}</time>
          </div>
          <CardTitle className="text-lg">{post.title}</CardTitle>
          <CardDescription>{post.description}</CardDescription>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>
    </Link>
  );
}
