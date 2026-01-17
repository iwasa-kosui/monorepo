import { Hono } from 'hono';

import { AboutPage } from '../../ui/pages/about.tsx';

const app = new Hono();

const detectLanguage = (acceptLanguage: string | undefined): 'ja' | 'en' => {
  if (!acceptLanguage) return 'en';
  const languages = acceptLanguage.split(',').map((lang) => lang.split(';')[0].trim().toLowerCase());
  for (const lang of languages) {
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('en')) return 'en';
  }
  return 'en';
};

app.get('/', (c) => {
  const acceptLanguage = c.req.header('Accept-Language');
  const lang = detectLanguage(acceptLanguage);
  return c.html(<AboutPage lang={lang} />);
});

export { app as AboutRouter };
