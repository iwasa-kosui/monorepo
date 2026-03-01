import { type ReactNode, useEffect, useRef, useState } from 'react';

let counter = 0;

export function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const mermaid = (await import('mermaid')).default;
      const isDark = document.documentElement.classList.contains('dark')
        || window.matchMedia('(prefers-color-scheme: dark)').matches;
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
      });
      const id = `mermaid-${counter++}`;
      try {
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setSvg('');
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (!svg) {
    return (
      <div className='my-4 p-4 bg-cream dark:bg-charcoal rounded-lg'>
        <div className='h-32' />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className='my-4 overflow-x-auto [&>svg]:mx-auto'
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const MERMAID_KEYWORDS = [
  'classDiagram',
  'flowchart',
  'sequenceDiagram',
  'graph ',
  'graph\n',
  'erDiagram',
  'gantt',
  'pie',
  'gitgraph',
  'stateDiagram',
  'journey',
  'quadrantChart',
  'mindmap',
  'timeline',
  'sankey',
  'xychart',
  'block-beta',
  'packet-beta',
];

export function isMermaid(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) return false;
    const content = trimmed.slice(endIdx + 3).trim();
    return MERMAID_KEYWORDS.some((kw) => content.startsWith(kw));
  }
  return MERMAID_KEYWORDS.some((kw) => trimmed.startsWith(kw));
}

export function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    return extractText(el.props.children);
  }
  return '';
}
