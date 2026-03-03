export interface TalkMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
}

const talkModules = import.meta.glob<TalkMeta>("../../../talks/*/meta.json", {
  eager: true,
  import: "default",
});

function extractSlug(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? "";
}

export function getAllTalks(): TalkMeta[] {
  return Object.entries(talkModules)
    .map(([path, meta]) => ({
      ...meta,
      slug: extractSlug(path),
    }))
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export function getTalkSlugs(): string[] {
  return Object.keys(talkModules).map(extractSlug);
}
