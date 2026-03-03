import { Link } from "react-router";
import { Card, CardHeader, CardTitle, CardDescription } from "@iwasa-kosui/ui";
import { getAllTalks } from "@/lib/talks";

export function Talks() {
  const talks = getAllTalks();

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Talks</h1>
      <div className="flex flex-col gap-4">
        {talks.map((talk) => (
          <Link key={talk.slug} to={`/talks/${talk.slug}`} className="block no-underline">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <div className="text-sm text-muted-foreground">
                  <time dateTime={talk.date}>{talk.date}</time>
                </div>
                <CardTitle className="text-lg">{talk.title}</CardTitle>
                <CardDescription>{talk.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {talks.length === 0 && (
          <p className="text-muted-foreground">No talks yet.</p>
        )}
      </div>
    </div>
  );
}
