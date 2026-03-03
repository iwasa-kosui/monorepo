import { useParams } from "react-router";
import { MDXProvider } from "@mdx-js/react";
import { getPost } from "@/lib/posts";
import { mdxComponents } from "@/components/MdxComponents";
import { Badge } from "@iwasa-kosui/ui";

export function Post() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Post not found</h1>
      </div>
    );
  }

  const { meta, Component } = post;

  return (
    <article>
      <header className="mb-8">
        <time dateTime={meta.date} className="text-sm text-muted-foreground">
          {meta.date}
        </time>
        <h1 className="mt-2 text-3xl font-bold">{meta.title}</h1>
        {meta.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {meta.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>
      <div className="prose">
        <MDXProvider components={mdxComponents}>
          <Component />
        </MDXProvider>
      </div>
    </article>
  );
}
