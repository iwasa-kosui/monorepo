import { findPresentations } from '@/utils/presentations';
import type { APIRoute, GetStaticPaths } from 'astro';

const SITE_URL = 'https://talks.kosui.me';

export const getStaticPaths: GetStaticPaths = () => {
  const presentations = findPresentations();
  return presentations.map((presentation) => ({
    params: { year: presentation.year, name: presentation.name },
    props: { presentation },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { presentation } = props;

  const embedUrl =
    presentation.slideType === 'local'
      ? `${SITE_URL}${presentation.basePath}?embedded=true&controls=true`
      : presentation.external.embedUrl;

  const pageUrl = `${SITE_URL}/talks/${presentation.year}/${presentation.name}/`;
  const ogImageUrl = `${SITE_URL}/og/talks/${presentation.year}/${presentation.name}.png`;

  const oembedResponse = {
    version: '1.0',
    type: 'rich',
    title: presentation.title,
    author_name: 'kosui',
    author_url: SITE_URL,
    provider_name: 'talks.kosui.me',
    provider_url: SITE_URL,
    thumbnail_url: ogImageUrl,
    thumbnail_width: 1200,
    thumbnail_height: 630,
    width: 960,
    height: 540,
    html: `<iframe src="${embedUrl}" width="960" height="540" style="border:0;aspect-ratio:16/9;width:100%;height:auto;" title="${presentation.title.replace(/"/g, '&quot;')}" allowfullscreen loading="lazy"></iframe>`,
    url: pageUrl,
  };

  return new Response(JSON.stringify(oembedResponse), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
