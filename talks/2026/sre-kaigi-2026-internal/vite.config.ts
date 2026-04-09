import MarkdownItGitHubAlerts from 'markdown-it-github-alerts';

export default {
  slidev: {
    markdown: {
      markdownItSetup(md: any) {
        md.use(MarkdownItGitHubAlerts, {
          titles: {
            note: '補足',
            tip: 'ヒント',
            important: '重要',
            warning: '注意',
            caution: '課題',
          },
        });
      },
    },
  },
};
