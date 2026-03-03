export function SlidevEmbed({ slug }: { slug: string }) {
  return (
    <iframe
      src={`/talks/${slug}/`}
      className="aspect-video w-full rounded-lg border border-border"
      title={`Slide: ${slug}`}
      allowFullScreen
    />
  );
}
