import type { FC } from "hono/jsx";


type OGPMetadata = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: "website" | "article";
  siteName?: string;
  author?: string;
  publishedTime?: string;
};

type LayoutProps = {
  ogp?: OGPMetadata;
  children?: unknown;
};

export const Layout: FC<LayoutProps> = (props) => {
  const { ogp } = props;
  const title = ogp?.title ? `${ogp.title} | blog.kosui.me` : "blog.kosui.me";
  const description = ogp?.description || "A microblog by kosui";

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" href="/favicon.ico" />
        <title>{title}</title>
        <meta name="description" content={description} />

        {/* OGP Meta Tags */}
        <meta property="og:title" content={ogp?.title || "blog.kosui.me"} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content={ogp?.type || "website"} />
        <meta property="og:site_name" content={ogp?.siteName || "blog.kosui.me"} />
        {ogp?.url && <meta property="og:url" content={ogp.url} />}
        {ogp?.image && <meta property="og:image" content={ogp.image} />}

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={ogp?.title || "blog.kosui.me"} />
        <meta name="twitter:description" content={description} />
        {ogp?.image && <meta name="twitter:image" content={ogp.image} />}

        {/* Article specific meta tags */}
        {ogp?.type === "article" && ogp?.author && (
          <meta property="article:author" content={ogp.author} />
        )}
        {ogp?.type === "article" && ogp?.publishedTime && (
          <meta property="article:published_time" content={ogp.publishedTime} />
        )}

        <script src="https://cdn.tailwindcss.com" />
      </head>
      <body class="bg-gray-50 dark:bg-gray-900 min-h-screen">
        <main class="max-w-2xl mx-auto px-4 py-8 relative">{props.children}</main>
      </body>
    </html>
  );
};

export const LayoutClient: FC<{
  client: string;
  server: string;
  children: unknown;
}> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <link rel="icon" href="/favicon.ico" />
      <title>blog.kosui.me</title>
      <script src="https://cdn.tailwindcss.com" />
      {import.meta.env.PROD ? (
        <script type="module" src={props.client} />
      ) : (
        <script type="module" src={props.server} />
      )}
    </head>
    <body class="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <main class="max-w-2xl mx-auto px-4 py-8 relative">{props.children}</main>
    </body>
  </html>
);
