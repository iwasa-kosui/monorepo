export const NAV_LINK_SELECTOR = 'aside nav a, body > nav a';

export const SPECULATION_PREFETCH_PATHS = [
  '/',
  '/notifications',
  '/likes',
  '/articles',
  '/x',
  '/search',
] as const;

export const speculationRules = () => ({
  prefetch: [
    {
      where: {
        and: [
          { selector_matches: NAV_LINK_SELECTOR },
          { or: SPECULATION_PREFETCH_PATHS.map((pathname) => ({ href_matches: { pathname } })) },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});

export const speculationRulesScript = (): string =>
  `<script type="speculationrules">${JSON.stringify(speculationRules())}</script>`;
