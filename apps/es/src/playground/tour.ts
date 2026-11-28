import { type EditorState, type Extension, Facet, RangeSet, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  gutterLineClass,
  GutterMarker,
  scrollPastEnd,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

export type TourStep = Readonly<{
  file: string;
  anchor: string;
  lines: number;
  title: string;
  body: string;
}>;

export type Tour = Readonly<{
  title: string;
  steps: readonly TourStep[];
}>;

export type TourRange = Readonly<{ first: number; last: number }>;

export type BodySegment = Readonly<{ text: string; code: boolean }>;

export type TourControls = Readonly<{
  previous: () => void;
  next: () => void;
  restart: () => void;
  close: () => void;
}>;

export const missingAnchorNote =
  'コードを書き換えたため、該当の行が見つかりません。「最初のコードに戻す」で元のコードに戻せます。';

export const countLines = (doc: string): number => doc.split('\n').length;

export const locateTourRange = (doc: string, anchor: string, lines: number): TourRange | null => {
  const index = anchor === '' ? -1 : doc.indexOf(anchor);
  if (index === -1) {
    return null;
  }
  const first = countLines(doc.slice(0, index));
  return { first, last: Math.min(first + Math.max(lines, 1) - 1, countLines(doc)) };
};

export const splitBody = (body: string): BodySegment[] =>
  body
    .split('`')
    .map((text, index) => ({ text, code: index % 2 === 1 }))
    .filter((segment) => segment.text !== '');

export const tourPosition = (index: number, total: number): string => `ツアー ${index + 1} / ${total}`;

export const tourAnnouncement = (tour: Tour, index: number): string =>
  `${tourPosition(index, tour.steps.length)} ${tour.steps[index]?.title ?? ''}`;

type TourConfig = Readonly<{ tour: Tour; file: string; controls: TourControls }>;

type TourState = Readonly<{
  step: number | null;
  decorations: DecorationSet;
  markers: RangeSet<GutterMarker>;
}>;

const tourConfig = Facet.define<TourConfig, TourConfig | null>({ combine: (values) => values[0] ?? null });

export const tourStepEffect = StateEffect.define<number | null>();

class TourGutterMarker extends GutterMarker {
  override elementClass = 'cm-tour-gutter';
}

const gutterMarker = new TourGutterMarker();
const lineMark = Decoration.line({ class: 'cm-tour-line' });

const cardButton = (action: string, label: string, className: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset['tourAction'] = action;
  return button;
};

const cardText = (tag: 'p' | 'span', className: string, text: string): HTMLElement => {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
};

const cardBody = (body: string): HTMLElement => {
  const paragraph = document.createElement('p');
  paragraph.className = 'cm-tour-body';
  for (const segment of splitBody(body)) {
    if (segment.code) {
      const code = document.createElement('code');
      code.textContent = segment.text;
      paragraph.append(code);
    } else {
      paragraph.append(segment.text);
    }
  }
  return paragraph;
};

const buildCard = (config: TourConfig, index: number, missing: boolean): HTMLElement => {
  const { tour, controls } = config;
  const step = tour.steps[index];
  const last = index === tour.steps.length - 1;
  const card = document.createElement('div');
  card.className = 'cm-tour-card';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', tour.title);

  const close = cardButton('close', '', 'cm-tour-close');
  close.setAttribute('aria-label', 'ツアーを閉じる');
  const head = document.createElement('div');
  head.className = 'cm-tour-head';
  head.append(cardText('span', 'cm-tour-position', tourPosition(index, tour.steps.length)), close);

  const previous = cardButton('previous', '前へ', 'cm-tour-button');
  previous.disabled = index === 0;
  const forward = last
    ? cardButton('restart', '最初のステップへ', 'cm-tour-button cm-tour-primary')
    : cardButton('next', '次へ', 'cm-tour-button cm-tour-primary');
  const nav = document.createElement('div');
  nav.className = 'cm-tour-nav';
  nav.append(previous, forward);

  card.append(head, cardText('p', 'cm-tour-title', step?.title ?? ''));
  if (missing) {
    card.append(cardText('p', 'cm-tour-notice', missingAnchorNote));
  }
  card.append(cardBody(step?.body ?? ''), nav);

  card.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-tour-action]')
      : null;
    const action = target?.dataset['tourAction'];
    if (target === null || target.disabled || action === undefined) {
      return;
    }
    if (action === 'previous' || action === 'next' || action === 'restart' || action === 'close') {
      controls[action]();
    }
  });
  return card;
};

class TourCardWidget extends WidgetType {
  readonly config: TourConfig;
  readonly index: number;
  readonly missing: boolean;

  constructor(config: TourConfig, index: number, missing: boolean) {
    super();
    this.config = config;
    this.index = index;
    this.missing = missing;
  }

  override eq(other: TourCardWidget): boolean {
    return other.config === this.config && other.index === this.index && other.missing === this.missing;
  }

  override get estimatedHeight(): number {
    return 168;
  }

  override toDOM(): HTMLElement {
    return buildCard(this.config, this.index, this.missing);
  }
}

const emptyTourState = (step: number | null): TourState => ({
  step,
  decorations: Decoration.none,
  markers: RangeSet.empty,
});

const buildTourState = (state: EditorState, step: number | null): TourState => {
  const config = state.facet(tourConfig);
  const target = config === null || step === null ? undefined : config.tour.steps[step];
  if (config === null || step === null || target === undefined || target.file !== config.file) {
    return emptyTourState(step);
  }
  const range = locateTourRange(state.doc.toString(), target.anchor, target.lines);
  if (range === null) {
    const widget = Decoration.widget({ widget: new TourCardWidget(config, step, true), block: true, side: -1 });
    return { step, decorations: Decoration.set([widget.range(0)]), markers: RangeSet.empty };
  }
  const lineStarts: number[] = [];
  for (let number = range.first; number <= range.last; number += 1) {
    lineStarts.push(state.doc.line(number).from);
  }
  const widget = Decoration.widget({ widget: new TourCardWidget(config, step, false), block: true, side: 1 });
  return {
    step,
    decorations: Decoration.set([
      ...lineStarts.map((from) => lineMark.range(from)),
      widget.range(state.doc.line(range.last).to),
    ], true),
    markers: RangeSet.of(lineStarts.map((from) => gutterMarker.range(from)), true),
  };
};

const tourField = StateField.define<TourState>({
  create: () => emptyTourState(null),
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(tourStepEffect)) {
        return effect.value === value.step && !transaction.docChanged
          ? value
          : buildTourState(transaction.state, effect.value);
      }
    }
    return transaction.docChanged && value.step !== null ? buildTourState(transaction.state, value.step) : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    gutterLineClass.from(field, (value) => value.markers),
  ],
});

const layoutKey = {};

const tourLayout = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.measure(view);
    }

    update(update: ViewUpdate): void {
      if (update.geometryChanged || update.viewportChanged || update.docChanged) {
        this.measure(update.view);
      }
    }

    measure(view: EditorView): void {
      view.requestMeasure({
        key: layoutKey,
        read: (target) => ({
          gutter: target.dom.querySelector<HTMLElement>('.cm-gutters')?.getBoundingClientRect().width ?? 0,
          width: target.scrollDOM.clientWidth,
        }),
        write: (size, target) => {
          target.dom.style.setProperty('--tour-gutter', `${size.gutter}px`);
          target.dom.style.setProperty('--tour-view', `${size.width}px`);
        },
      });
    }
  },
);

export const createTourExtension = (tour: Tour, file: string, controls: TourControls): Extension => [
  tourConfig.of({ tour, file, controls }),
  tourField,
  tourLayout,
  scrollPastEnd(),
];

export const tourRangeBounds = (state: EditorState, step: TourStep): { from: number; to: number } | null => {
  const range = locateTourRange(state.doc.toString(), step.anchor, step.lines);
  return range === null ? null : { from: state.doc.line(range.first).from, to: state.doc.line(range.last).to };
};

const waitingForSize = new WeakMap<EditorView, ResizeObserver>();

export const revealTourStep = (view: EditorView, step: TourStep): void => {
  waitingForSize.get(view)?.disconnect();
  waitingForSize.delete(view);
  const place = (): void =>
    view.requestMeasure({
      read: (target) => {
        const bounds = tourRangeBounds(target.state, step);
        const padding = target.documentPadding.top;
        return {
          top: bounds === null ? 0 : target.lineBlockAt(bounds.from).top + padding,
          bottom: bounds === null ? 0 : target.lineBlockAt(bounds.to).bottom + padding,
          line: target.defaultLineHeight,
          height: target.scrollDOM.clientHeight,
        };
      },
      write: ({ top, bottom, line, height }, target) => {
        const margin = top === 0 ? 0 : line * 2;
        const wanted = top - margin;
        const fitted = bottom - wanted + line / 2 > height ? Math.min(bottom + line / 2 - height, top - line) : wanted;
        target.scrollDOM.scrollTop = Math.max(fitted, 0);
      },
    });
  const run = (): void => {
    place();
    requestAnimationFrame(place);
  };
  if (view.scrollDOM.clientHeight > 0) {
    run();
    return;
  }
  const observer = new ResizeObserver(() => {
    if (view.scrollDOM.clientHeight > 0) {
      observer.disconnect();
      waitingForSize.delete(view);
      run();
    }
  });
  observer.observe(view.scrollDOM);
  waitingForSize.set(view, observer);
};
