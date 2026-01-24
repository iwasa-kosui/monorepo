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
        <meta name='twitter:card' content={ogp?.image ? 'summary_large_image' : 'summary'} />
        <meta name='twitter:title' content={ogp?.title || 'blog.kosui.me'} />
        <meta name='twitter:description' content={description} />
        {ogp?.image && <meta name='twitter:image' content={ogp.image} />}

        {/* Article specific meta tags */}
        {ogp?.type === 'article' && ogp?.author && <meta property='article:author' content={ogp.author} />}
        {ogp?.type === 'article' && ogp?.publishedTime && (
          <meta property='article:published_time' content={ogp.publishedTime} />
        )}

        <script src='https://cdn.tailwindcss.com' />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .shiki {
              background-color: var(--shiki-light-bg) !important;
              padding: 1rem;
              border-radius: 12px;
              overflow-x: auto;
              font-size: 0.875rem;
              line-height: 1.6;
            }
            .shiki span {
              color: var(--shiki-light);
              background-color: transparent !important;
            }
            @media (prefers-color-scheme: dark) {
              .shiki {
                background-color: var(--shiki-dark-bg) !important;
              }
              .shiki span {
                color: var(--shiki-dark);
              }
            }
            /* Clay UI hover effects */
            .clay-hover-lift {
              transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .clay-hover-lift:hover {
              transform: translateY(-2px);
            }
            .clay-active {
              transform: translateY(1px) scale(0.98);
            }

            /* Organic blob shapes */
            .blob {
              border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            }
            .blob-2 {
              border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
            }
            .blob-3 {
              border-radius: 70% 30% 50% 50% / 30% 50% 50% 70%;
            }
            .blob-avatar {
              border-radius: 60% 40% 45% 55% / 50% 55% 45% 50%;
            }
            .blob-card {
              border-radius: 24px 60px 24px 60px / 60px 24px 60px 24px;
            }
            .blob-btn {
              border-radius: 30% 70% 60% 40% / 50% 40% 60% 50%;
            }
            .blob-tag {
              border-radius: 40% 60% 50% 50% / 50% 50% 60% 40%;
            }

            /* Decorative background blobs */
            .blob-bg {
              position: relative;
              overflow: hidden;
            }
            .blob-bg::before {
              content: '';
              position: absolute;
              width: 120px;
              height: 120px;
              background: rgba(194, 120, 92, 0.06);
              border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
              top: -25px;
              right: -25px;
              z-index: 0;
              pointer-events: none;
            }
            .blob-bg::after {
              content: '';
              position: absolute;
              width: 70px;
              height: 70px;
              background: rgba(143, 168, 139, 0.07);
              border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
              bottom: -15px;
              left: -15px;
              z-index: 0;
              pointer-events: none;
            }
            @media (prefers-color-scheme: dark) {
              .blob-bg::before {
                background: rgba(194, 120, 92, 0.12);
              }
              .blob-bg::after {
                background: rgba(143, 168, 139, 0.1);
              }
            }

            /* Animated blob for special elements */
            @keyframes blob-morph {
              0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
              25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
              50% { border-radius: 50% 60% 30% 60% / 30% 40% 70% 60%; }
              75% { border-radius: 40% 60% 50% 40% / 60% 50% 40% 60%; }
            }
            .blob-animate {
              animation: blob-morph 8s ease-in-out infinite;
            }

            /* Page-level background decoration */
            .bg-decoration {
              position: fixed;
              width: 100%;
              height: 100%;
              pointer-events: none;
              top: 0;
              left: 0;
              z-index: -1;
              overflow: hidden;
            }
            .bg-blob {
              position: absolute;
              border-radius: 50%;
              filter: blur(80px);
              opacity: 0.35;
            }
            .bg-blob-1 {
              width: 400px;
              height: 400px;
              background: #D49A82;
              top: -100px;
              right: -100px;
            }
            .bg-blob-2 {
              width: 300px;
              height: 300px;
              background: #D4C4A8;
              bottom: 10%;
              left: -50px;
            }
            .bg-blob-3 {
              width: 200px;
              height: 200px;
              background: #8FA88B;
              bottom: 30%;
              right: 10%;
              opacity: 0.2;
            }
            @media (prefers-color-scheme: dark) {
              .bg-blob {
                opacity: 0.15;
              }
              .bg-blob-3 {
                opacity: 0.1;
              }
            }
          `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    terracotta: {
                      DEFAULT: '#C2785C',
                      light: '#D49A82',
                      dark: '#A65D42',
                    },
                    rust: '#8B5A42',
                    sand: {
                      DEFAULT: '#D4C4A8',
                      light: '#E8DCC8',
                    },
                    sage: {
                      DEFAULT: '#8FA88B',
                      dark: '#6B8567',
                    },
                    cream: '#F8F6F1',
                    'warm-white': '#FDF9F6',
                    'warm-gray': {
                      DEFAULT: '#E8E4DE',
                      dark: '#D4CFC6',
                    },
                    charcoal: {
                      DEFAULT: '#5A5450',
                      light: '#7A746E',
                    },
                    'clay-bg': '#F0EEE9',
                    gray: {
                      50: '#F8F6F1',
                      100: '#F0EEE9',
                      200: '#E8E4DE',
                      300: '#D4CFC6',
                      400: '#A39E96',
                      500: '#8c8579',
                      600: '#5A5450',
                      700: '#3D3835',
                      800: '#2D2A28',
                      900: '#1a1918',
                      950: '#121110',
                    },
                  },
                  boxShadow: {
                    'clay': 'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 2px 8px rgba(60,50,45,0.04), 0 4px 16px rgba(60,50,45,0.06)',
                    'clay-hover': 'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 4px 12px rgba(60,50,45,0.06), 0 8px 24px rgba(60,50,45,0.08)',
                    'clay-sm': 'inset 0 -1px 3px rgba(0,0,0,0.02), inset 0 1px 4px rgba(255,255,255,0.9), 0 1px 4px rgba(60,50,45,0.04)',
                    'clay-btn': 'inset 0 -2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 8px rgba(194,120,92,0.2)',
                    'clay-btn-hover': 'inset 0 -2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 12px rgba(194,120,92,0.3)',
                    'clay-inset': 'inset 0 1px 3px rgba(0,0,0,0.03)',
                    'clay-dark': 'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1)',
                    'clay-dark-hover': 'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.15)',
                    'focus-ring': '0px 0px 0px 3px rgba(194, 120, 92, 0.15)',
                    'focus-ring-dark': '0px 0px 0px 3px rgba(194, 120, 92, 0.25)',
                  },
                  borderRadius: {
                    'clay': '16px',
                  },
                },
              },
            }
          `,
          }}
        />
      </head>
      <body class='bg-clay-bg dark:bg-gray-900 min-h-screen pb-16 md:pb-0 md:px-24 text-charcoal dark:text-gray-100'>
        {/* Background decoration blobs */}
        <div class='bg-decoration' aria-hidden='true'>
          <div class='bg-blob bg-blob-1' />
          <div class='bg-blob bg-blob-2' />
          <div class='bg-blob bg-blob-3' />
        </div>
        <Sidebar isLoggedIn={isLoggedIn} />
        <main class='max-w-2xl mx-auto px-6 py-8 relative'>{props.children}</main>
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
  ogp?: OGPMetadata;
  children: unknown;
}> = (props) => {
  const { isLoggedIn = true, ogp } = props;
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
        <meta name='twitter:card' content={ogp?.image ? 'summary_large_image' : 'summary'} />
        <meta name='twitter:title' content={ogp?.title || 'blog.kosui.me'} />
        <meta name='twitter:description' content={description} />
        {ogp?.image && <meta name='twitter:image' content={ogp.image} />}

        {/* Article specific meta tags */}
        {ogp?.type === 'article' && ogp?.author && <meta property='article:author' content={ogp.author} />}
        {ogp?.type === 'article' && ogp?.publishedTime && (
          <meta property='article:published_time' content={ogp.publishedTime} />
        )}

        <script src='https://cdn.tailwindcss.com' />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .shiki {
              background-color: var(--shiki-light-bg) !important;
              padding: 1rem;
              border-radius: 12px;
              overflow-x: auto;
              font-size: 0.875rem;
              line-height: 1.6;
            }
            .shiki span {
              color: var(--shiki-light);
              background-color: transparent !important;
            }
            @media (prefers-color-scheme: dark) {
              .shiki {
                background-color: var(--shiki-dark-bg) !important;
              }
              .shiki span {
                color: var(--shiki-dark);
              }
            }
            /* Clay UI hover effects */
            .clay-hover-lift {
              transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .clay-hover-lift:hover {
              transform: translateY(-2px);
            }
            .clay-active {
              transform: translateY(1px) scale(0.98);
            }

            /* Organic blob shapes */
            .blob {
              border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            }
            .blob-2 {
              border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
            }
            .blob-3 {
              border-radius: 70% 30% 50% 50% / 30% 50% 50% 70%;
            }
            .blob-avatar {
              border-radius: 60% 40% 45% 55% / 50% 55% 45% 50%;
            }
            .blob-card {
              border-radius: 24px 60px 24px 60px / 60px 24px 60px 24px;
            }
            .blob-btn {
              border-radius: 30% 70% 60% 40% / 50% 40% 60% 50%;
            }
            .blob-tag {
              border-radius: 40% 60% 50% 50% / 50% 50% 60% 40%;
            }

            /* Decorative background blobs */
            .blob-bg {
              position: relative;
              overflow: hidden;
            }
            .blob-bg::before {
              content: '';
              position: absolute;
              width: 120px;
              height: 120px;
              background: rgba(194, 120, 92, 0.06);
              border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
              top: -25px;
              right: -25px;
              z-index: 0;
              pointer-events: none;
            }
            .blob-bg::after {
              content: '';
              position: absolute;
              width: 70px;
              height: 70px;
              background: rgba(143, 168, 139, 0.07);
              border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
              bottom: -15px;
              left: -15px;
              z-index: 0;
              pointer-events: none;
            }
            @media (prefers-color-scheme: dark) {
              .blob-bg::before {
                background: rgba(194, 120, 92, 0.12);
              }
              .blob-bg::after {
                background: rgba(143, 168, 139, 0.1);
              }
            }

            /* Animated blob for special elements */
            @keyframes blob-morph {
              0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
              25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
              50% { border-radius: 50% 60% 30% 60% / 30% 40% 70% 60%; }
              75% { border-radius: 40% 60% 50% 40% / 60% 50% 40% 60%; }
            }
            .blob-animate {
              animation: blob-morph 8s ease-in-out infinite;
            }

            /* Page-level background decoration */
            .bg-decoration {
              position: fixed;
              width: 100%;
              height: 100%;
              pointer-events: none;
              top: 0;
              left: 0;
              z-index: -1;
              overflow: hidden;
            }
            .bg-blob {
              position: absolute;
              border-radius: 50%;
              filter: blur(80px);
              opacity: 0.35;
            }
            .bg-blob-1 {
              width: 400px;
              height: 400px;
              background: #D49A82;
              top: -100px;
              right: -100px;
            }
            .bg-blob-2 {
              width: 300px;
              height: 300px;
              background: #D4C4A8;
              bottom: 10%;
              left: -50px;
            }
            .bg-blob-3 {
              width: 200px;
              height: 200px;
              background: #8FA88B;
              bottom: 30%;
              right: 10%;
              opacity: 0.2;
            }
            @media (prefers-color-scheme: dark) {
              .bg-blob {
                opacity: 0.15;
              }
              .bg-blob-3 {
                opacity: 0.1;
              }
            }
          `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    terracotta: {
                      DEFAULT: '#C2785C',
                      light: '#D49A82',
                      dark: '#A65D42',
                    },
                    rust: '#8B5A42',
                    sand: {
                      DEFAULT: '#D4C4A8',
                      light: '#E8DCC8',
                    },
                    sage: {
                      DEFAULT: '#8FA88B',
                      dark: '#6B8567',
                    },
                    cream: '#F8F6F1',
                    'warm-white': '#FDF9F6',
                    'warm-gray': {
                      DEFAULT: '#E8E4DE',
                      dark: '#D4CFC6',
                    },
                    charcoal: {
                      DEFAULT: '#5A5450',
                      light: '#7A746E',
                    },
                    'clay-bg': '#F0EEE9',
                    gray: {
                      50: '#F8F6F1',
                      100: '#F0EEE9',
                      200: '#E8E4DE',
                      300: '#D4CFC6',
                      400: '#A39E96',
                      500: '#8c8579',
                      600: '#5A5450',
                      700: '#3D3835',
                      800: '#2D2A28',
                      900: '#1a1918',
                      950: '#121110',
                    },
                  },
                  boxShadow: {
                    'clay': 'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 2px 8px rgba(60,50,45,0.04), 0 4px 16px rgba(60,50,45,0.06)',
                    'clay-hover': 'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 4px 12px rgba(60,50,45,0.06), 0 8px 24px rgba(60,50,45,0.08)',
                    'clay-sm': 'inset 0 -1px 3px rgba(0,0,0,0.02), inset 0 1px 4px rgba(255,255,255,0.9), 0 1px 4px rgba(60,50,45,0.04)',
                    'clay-btn': 'inset 0 -2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 8px rgba(194,120,92,0.2)',
                    'clay-btn-hover': 'inset 0 -2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.2), 0 4px 12px rgba(194,120,92,0.3)',
                    'clay-inset': 'inset 0 1px 3px rgba(0,0,0,0.03)',
                    'clay-dark': 'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1)',
                    'clay-dark-hover': 'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.15)',
                    'focus-ring': '0px 0px 0px 3px rgba(194, 120, 92, 0.15)',
                    'focus-ring-dark': '0px 0px 0px 3px rgba(194, 120, 92, 0.25)',
                  },
                  borderRadius: {
                    'clay': '16px',
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
      <body class='bg-clay-bg dark:bg-gray-900 min-h-screen pb-16 md:pb-0 md:px-16 text-charcoal dark:text-gray-100'>
        {/* Background decoration blobs */}
        <div class='bg-decoration' aria-hidden='true'>
          <div class='bg-blob bg-blob-1' />
          <div class='bg-blob bg-blob-2' />
          <div class='bg-blob bg-blob-3' />
        </div>
        <Sidebar isLoggedIn={isLoggedIn} />
        <main class='max-w-2xl mx-auto px-6 py-8 relative'>{props.children}</main>
        <BottomNav isLoggedIn={isLoggedIn} />
        {isLoggedIn && <PostModal />}
      </body>
    </html>
  );
};
