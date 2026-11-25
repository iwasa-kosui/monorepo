/**
 * シェア用のリンク先を埋め、はてなブックマークの件数を取得して表示する。
 * `data-share-buttons` を持つ要素が対象。ShareButtons と ArticleActions の両方が読み込む。
 */
function initShareButtons() {
  document.querySelectorAll<HTMLElement>('[data-share-buttons]').forEach(
    (container) => {
      const pageUrl = container.dataset.pageUrl;
      const pageTitle = container.dataset.pageTitle;
      if (!pageUrl || !pageTitle) return;

      const encodedUrl = encodeURIComponent(pageUrl);
      const encodedTitle = encodeURIComponent(pageTitle);
      const text = encodeURIComponent(`${pageTitle} ${pageUrl}`);

      const shareUrls: Record<string, string> = {
        hatena: `https://b.hatena.ne.jp/entry/s/${pageUrl.replace('https://', '')}`,
        x: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        bluesky: `https://bsky.app/intent/compose?text=${text}`,
        mastodon: `https://donshare.net/share.html?text=${text}`,
        misskey: `https://misskeyshare.link/share.html?text=${text}`,
      };

      container.querySelectorAll<HTMLElement>('[data-share]').forEach((el) => {
        const platform = el.dataset.share;
        if (platform && shareUrls[platform]) {
          el.setAttribute('href', shareUrls[platform]);
        }
      });
    },
  );
}

function jsonp(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const name = `__jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanup = () => {
      script.remove();
      // @ts-expect-error JSONP requires dynamic global properties
      delete window[name];
    };
    // @ts-expect-error JSONP requires dynamic global properties
    window[name] = (data: number) => {
      cleanup();
      resolve(data);
    };
    script.src = `${url}&callback=${name}`;
    script.onerror = () => {
      cleanup();
      reject(new Error(`JSONP failed: ${url}`));
    };
    document.body.appendChild(script);
  });
}

async function fetchHatenaBookmarkCount() {
  const containers = document.querySelectorAll<HTMLElement>(
    '[data-share-buttons]',
  );
  const urls = new Set<string>();
  containers.forEach((c) => {
    if (c.dataset.pageUrl) urls.add(c.dataset.pageUrl);
  });

  await Promise.allSettled(
    [...urls].map(async (pageUrl) => {
      const count = await jsonp(
        `https://bookmark.hatenaapis.com/count/entry?url=${encodeURIComponent(pageUrl)}`,
      );
      if (count <= 0) return;
      containers.forEach((container) => {
        if (container.dataset.pageUrl !== pageUrl) return;
        container
          .querySelectorAll<HTMLElement>('[data-hatena-count]')
          .forEach((badge) => {
            badge.textContent = String(count);
            badge.classList.remove('hidden');
          });
      });
    }),
  );
}

document.addEventListener('astro:page-load', () => {
  initShareButtons();
  fetchHatenaBookmarkCount();
});
