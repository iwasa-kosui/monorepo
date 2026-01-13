import type { FC } from "hono/jsx";
import { Env } from "./env.ts";

export const Layout: FC = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <link rel="icon" href="/favicon.ico" />
      <title>blog.kosui.me</title>
      <script src="https://cdn.tailwindcss.com" />
    </head>
    <body class="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <main class="max-w-2xl mx-auto px-4 py-8 relative">{props.children}</main>
    </body>
  </html>
);

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
