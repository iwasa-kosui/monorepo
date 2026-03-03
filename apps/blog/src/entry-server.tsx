import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";
import { getPostSlugs } from "./lib/posts";
import { getTalkSlugs } from "./lib/talks";

export function render(url: string) {
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
}

export function getRoutes(): string[] {
  const postSlugs = getPostSlugs();
  const talkSlugs = getTalkSlugs();
  return [
    "/",
    "/about",
    "/talks",
    ...postSlugs.map((slug) => `/posts/${slug}`),
    ...talkSlugs.map((slug) => `/talks/${slug}`),
  ];
}
