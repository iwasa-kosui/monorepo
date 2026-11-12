import { layoutStyle, tailwindConfigScript } from './layoutAssets.ts';

export const renderErrorPage = (): string =>
  `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light dark">
    <title>ページを表示できませんでした | blog.kosui.me</title>
    <meta name="robots" content="noindex">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${layoutStyle}</style>
    <script>${tailwindConfigScript}</script>
  </head>
  <body class="bg-clay-bg dark:bg-gray-900 min-h-screen text-charcoal dark:text-gray-100">
    <main class="max-w-2xl mx-auto px-6 py-8 relative">
      <h1>ページを表示できませんでした</h1>
      <p>時間をおいて、もう一度読み込んでください。</p>
      <p>
        <a href="">もう一度読み込む</a>
        <a href="/">ホームへ戻る</a>
      </p>
    </main>
  </body>
</html>`;
