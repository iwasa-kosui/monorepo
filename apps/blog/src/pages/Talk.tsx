import { useParams, Link } from "react-router";
import { Button } from "@iwasa-kosui/ui";
import { SlidevEmbed } from "@/components/SlidevEmbed";
import { getAllTalks } from "@/lib/talks";

export function Talk() {
  const { slug } = useParams<{ slug: string }>();
  const talks = getAllTalks();
  const talk = talks.find((t) => t.slug === slug);

  if (!talk || !slug) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Talk not found</h1>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/talks">&larr; Back to Talks</Link>
        </Button>
      </div>
      <header className="mb-6">
        <time dateTime={talk.date} className="text-sm text-muted-foreground">
          {talk.date}
        </time>
        <h1 className="mt-2 text-3xl font-bold">{talk.title}</h1>
        <p className="mt-2 text-muted-foreground">{talk.description}</p>
      </header>
      <SlidevEmbed slug={slug} />
    </div>
  );
}
