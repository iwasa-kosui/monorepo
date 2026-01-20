import type { FC } from 'hono/jsx';

import { BottomNav } from './ui/components/BottomNav.tsx';
import { PostModal } from './ui/components/PostModal.tsx';
import { Sidebar } from './ui/components/Sidebar.tsx';

type OGPMetadata = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: 'website' | 'article';
  siteName?: string;
  author?: string;
  publishedTime?: string;
};

type LayoutProps = {
  ogp?: OGPMetadata;
  isLoggedIn?: boolean;
  children?: unknown;
};

export const Layout: FC<LayoutProps> = (props) => {
  const { ogp, isLoggedIn = false } = props;
  const title = ogp?.title ? `${ogp.title} | blog.kosui.me` : 'blog.kosui.me';
  const description = ogp?.description || 'A microblog by kosui';

  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <meta name='color-scheme' content='light dark' />
        <link rel='icon' href='/favicon.ico' />
        <link rel='manifest' href='/manifest.json' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='Microblog' />
        <link rel='apple-touch-icon' href='/icon-192.png' />
        <meta name='theme-color' content='#1a1918' />
        <title>{title}</title>
        <meta name='description' content={description} />

        {/* OGP Meta Tags */}
        <meta property='og:title' content={ogp?.title || 'blog.kosui.me'} />
        <meta property='og:description' content={description} />
        <meta property='og:type' content={ogp?.type || 'website'} />
        <meta property='og:site_name' content={ogp?.siteName || 'blog.kosui.me'} />
        {ogp?.url && <meta property='og:url' content={ogp.url} />}
        {ogp?.image && <meta property='og:image' content={ogp.image} />}

        {/* Twitter Card Meta Tags */}
        <meta name='twitter:card' content='summary' />
        <meta name='twitter:title' content={ogp?.title || 'blog.kosui.me'} />
        <meta name='twitter:description' content={description} />
        {ogp?.image && <meta name='twitter:image' content={ogp.image} />}

        {/* Article specific meta tags */}
        {ogp?.type === 'article' && ogp?.author && <meta property='article:author' content={ogp.author} />}
        {ogp?.type === 'article' && ogp?.publishedTime && (
          <meta property='article:published_time' content={ogp.publishedTime} />
        )}

        <script src='https://cdn.tailwindcss.com' />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    gray: {
                      50: '#fcfaf8',
                      100: '#f5f2ef',
                      200: '#ebe6e0',
                      300: '#d4cfc7',
                      400: '#a39e96',
                      500: '#8c8579',
                      600: '#6b665e',
                      700: '#4a4640',
                      800: '#262524',
                      900: '#1a1918',
                      950: '#121110',
                    },
                  },
                  boxShadow: {
                    'puffy': '0px 3px 15px 0px hsla(5, 70%, 90%, 0.6)',
                    'puffy-dark': '0px 3px 15px 0px hsla(5, 30%, 20%, 0.4)',
                    'focus-ring': '0px 0px 0px 2px hsla(20, 70%, 55%, 1), 0px 3px 15px 0px hsla(20, 60%, 60%, 0.5)',
                    'focus-ring-dark': '0px 0px 0px 2px hsla(20, 60%, 50%, 1), 0px 3px 15px 0px hsla(20, 50%, 35%, 0.5)',
                  },
                },
              },
            }
          `,
          }}
        />
      </head>
      <body class='bg-gray-50 dark:bg-gray-900 min-h-screen pb-16 md:pb-0 md:px-24'>
        <Sidebar isLoggedIn={isLoggedIn} />
        <main class='max-w-2xl mx-auto px-4 py-8 relative'>{props.children}</main>
        <BottomNav isLoggedIn={isLoggedIn} />
        {isLoggedIn && <PostModal />}
      </body>
    </html>
  );
};

export const LayoutClient: FC<{
  client: string;
  server: string;
  isLoggedIn?: boolean;
  children: unknown;
}> = (props) => {
  const { isLoggedIn = true } = props;
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <meta name='color-scheme' content='light dark' />
        <link rel='icon' href='/favicon.ico' />
        <link rel='manifest' href='/manifest.json' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='Microblog' />
        <link rel='apple-touch-icon' href='/icon-192.png' />
        <meta name='theme-color' content='#1a1918' />
        <title>blog.kosui.me</title>
        <script src='https://cdn.tailwindcss.com' />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    gray: {
                      50: '#fcfaf8',
                      100: '#f5f2ef',
                      200: '#ebe6e0',
                      300: '#d4cfc7',
                      400: '#a39e96',
                      500: '#8c8579',
                      600: '#6b665e',
                      700: '#4a4640',
                      800: '#262524',
                      900: '#1a1918',
                      950: '#121110',
                    },
                  },
                  boxShadow: {
                    'puffy': '0px 3px 15px 0px hsla(5, 70%, 90%, 0.6)',
                    'puffy-dark': '0px 3px 15px 0px hsla(5, 30%, 20%, 0.4)',
                    'focus-ring': '0px 0px 0px 2px hsla(20, 70%, 55%, 1), 0px 3px 15px 0px hsla(20, 60%, 60%, 0.5)',
                    'focus-ring-dark': '0px 0px 0px 2px hsla(20, 60%, 50%, 1), 0px 3px 15px 0px hsla(20, 50%, 35%, 0.5)',
                  },
                },
              },
            }
          `,
          }}
        />
        {import.meta.env.PROD
          ? <script type='module' src={props.client} />
          : <script type='module' src={props.server} />}
      </head>
      <body class='bg-gray-50 dark:bg-gray-900 min-h-screen pb-16 md:pb-0 md:px-16'>
        <Sidebar isLoggedIn={isLoggedIn} />
        <main class='max-w-2xl mx-auto px-4 py-8 relative'>{props.children}</main>
        <BottomNav isLoggedIn={isLoggedIn} />
        {isLoggedIn && <PostModal />}
      </body>
    </html>
  );
};
