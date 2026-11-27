import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-chromium';

const WIDTH = 1200;
const HEIGHT = 630;
const SEED = 0x5ea5;

const appRoot = path.resolve(import.meta.dirname, '..');
const componentsDir = path.join(appRoot, 'src', 'components');
const globalCss = path.join(appRoot, 'src', 'styles', 'global.css');

const require = createRequire(import.meta.url);
type Esbuild = { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as Esbuild;

const { values } = parseArgs({
  options: {
    time: { type: 'string', default: '28.4' },
    frame: { type: 'string', default: '965,215,240' },
    out: { type: 'string', default: path.join(import.meta.dirname, 'og-assets', 'shore.png') },
  },
});

const time = Number(values.time);
const frame = (values.frame ?? '').split(',').map(Number);
if (!Number.isFinite(time) || frame.length !== 3 || frame.some((n) => !Number.isFinite(n))) {
  throw new Error('usage: --time <秒> --frame <x>,<y>,<size> --out <パス>');
}
const out = path.resolve(values.out ?? '');

const readLightPalette = (): string => {
  const css = fs.readFileSync(globalCss, 'utf8');
  const background = css.match(/--color-bg:\s*([^;]+);/)?.[1];
  const palette = css.match(/:root\s*\{([^}]*--shore-sand:[^}]*)\}/)?.[1];
  if (!background || !palette) throw new Error(`${globalCss} から海辺の配色を読めません`);
  return `:root { --color-bg: ${background}; ${palette} }`;
};

const bundle = async (): Promise<string> => {
  const result = await esbuild.build({
    stdin: {
      contents: `
        import { createShoreRenderer, readPalette } from './ShoreHero/renderer';
        import { coverage, createWaves, initialDrift, packWaves, visibility } from './ShoreHero/wave';

        window.renderShore = ({ time, frame }) => {
          const canvas = document.querySelector('canvas');
          const root = document.querySelector('.shore-palette');
          const renderer = createShoreRenderer(canvas);
          if (!renderer) throw new Error('WebGL を使えません');
          const waves = createWaves(Math.random);
          const swashes = waves.visibleAt(time);
          const drift = initialDrift;
          renderer.render({
            width: ${WIDTH},
            height: ${HEIGHT},
            pixelRatio: 1,
            time,
            tide: 0,
            waves: packWaves(swashes, time),
            rect: frame,
            shrimp: {
              offset: [0, 0],
              scale: 1,
              rotation: drift.spin,
              cover: coverage(drift, swashes, time, 0),
              visible: visibility(drift),
              buried: drift.buried,
              blinking: false,
            },
            palette: readPalette(root),
          });
          return canvas.toDataURL('image/png');
        };
      `,
      resolveDir: componentsDir,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  return result.outputFiles[0]?.text ?? '';
};

const seededRandom = `
  (() => {
    let state = ${SEED};
    Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
`;

const html = `<!doctype html>
<html>
<head>
<style>
${readLightPalette()}
html, body { margin: 0; background: var(--color-bg); }
.shore-palette { position: fixed; inset: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
canvas { display: block; width: ${WIDTH}px; height: ${HEIGHT}px; }
</style>
</head>
<body>
<div class="shore-palette"><canvas></canvas></div>
</body>
</html>`;

// GPU ごとに画素が変わるため、ソフトウェア描画に固定する
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await page.setContent(html);
  await page.evaluate(seededRandom);
  await page.addScriptTag({ content: await bundle() });
  const dataUrl = await page.evaluate(
    ({ time, frame }) =>
      (window as unknown as { renderShore: (scene: unknown) => string }).renderShore({ time, frame }),
    { time, frame },
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
