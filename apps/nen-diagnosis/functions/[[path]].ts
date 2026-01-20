const NEN_TYPES = [
  'enhancement',
  'transmutation',
  'emission',
  'manipulation',
  'conjuration',
  'specialization',
] as const;

type NenType = (typeof NEN_TYPES)[number];

const isValidNenType = (value: string): value is NenType => NEN_TYPES.includes(value as NenType);

type NenTypeInfo = Readonly<{
  japaneseName: string;
  personality: string;
  color: string;
}>;

const nenTypeInfoMap: Record<NenType, NenTypeInfo> = {
  enhancement: {
    japaneseName: '強化系',
    personality:
      '単純で一途。曲がったことが嫌いで、思ったことをすぐ口にする。決意が固く、一度決めたことは最後までやり通す。',
    color: '#FFD700',
  },
  transmutation: {
    japaneseName: '変化系',
    personality: '気まぐれで嘘つき。でも自分の嘘は嘘だと思っていない。独自の価値観を持ち、周りに流されない。',
    color: '#9370DB',
  },
  emission: {
    japaneseName: '放出系',
    personality: '短気で大雑把。細かいことを気にしない。情に厚く、仲間思い。',
    color: '#FF6347',
  },
  manipulation: {
    japaneseName: '操作系',
    personality:
      '論理的で理屈っぽい。自分の思い通りにしたがり、マイペース。計画性があり、目的のためには手段を選ばない。',
    color: '#4169E1',
  },
  conjuration: {
    japaneseName: '具現化系',
    personality: '神経質で真面目。几帳面でルールを守る。こだわりが強く、完璧主義。',
    color: '#32CD32',
  },
  specialization: {
    japaneseName: '特質系',
    personality:
      '個人主義でカリスマ性がある。独自の世界観を持ち、普通とは違う視点で物事を見る。時に周囲を惹きつけ、時に孤立する。',
    color: '#FF69B4',
  },
};

const generateOgpTags = (url: URL): string => {
  const nenType = url.searchParams.get('type');

  // デフォルトのOGPタグ
  let title = '念系統診断 - オーラ別性格診断';
  let description =
    'あなたの念系統を診断します。日常の行動パターンから、強化系・変化系・放出系・操作系・具現化系・特質系のどれに属するかを判定。';

  // 診断結果がある場合はカスタマイズ
  if (nenType && isValidNenType(nenType)) {
    const info = nenTypeInfoMap[nenType];
    title = `念系統診断の結果は「${info.japaneseName}」でした！`;
    description = info.personality;
  }

  const ogUrl = url.origin + url.pathname + url.search;

  return `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:site_name" content="念系統診断" />
    <meta property="og:locale" content="ja_JP" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
  `;
};

type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 静的アセット（JS, CSS, 画像など）はそのまま返す
  const assetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  if (assetExtensions.some((ext) => url.pathname.endsWith(ext))) {
    return env.ASSETS.fetch(request);
  }

  // クローラー（bot）かどうかをUser-Agentで判定
  const userAgent = request.headers.get('user-agent') || '';
  const isCrawler = /bot|crawl|spider|slurp|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot/i
    .test(
      userAgent,
    );

  // クローラーでない場合は通常のページを返す
  if (!isCrawler) {
    return env.ASSETS.fetch(request);
  }

  // クローラーの場合はOGPタグを挿入したHTMLを返す
  const response = await env.ASSETS.fetch(new Request(url.origin + '/', request));
  const html = await response.text();

  const ogpTags = generateOgpTags(url);

  // </head>の前にOGPタグを挿入
  const modifiedHtml = html.replace('</head>', `${ogpTags}</head>`);

  return new Response(modifiedHtml, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      'content-type': 'text/html;charset=UTF-8',
    },
  });
};
