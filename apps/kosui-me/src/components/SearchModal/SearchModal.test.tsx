import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SearchModal } from './SearchModal';

// Mock usePagefind hook
vi.mock('./usePagefind', () => ({
  usePagefind: () => ({
    state: { status: 'idle' as const },
    search: vi.fn(),
    reset: vi.fn(),
    loadPagefind: vi.fn(),
  }),
}));

// jsdom does not implement window.matchMedia
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('SearchModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<SearchModal />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens on Cmd+K and shows search input', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();

    const input = screen.getByPlaceholderText('記事やトークを検索...');
    expect(input).toBeDefined();
  });

  it('opens on Ctrl+K', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('closes on Escape', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on backdrop click', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog')).toBeDefined();

    const backdrop = screen.getByRole('presentation');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on open-search custom event', () => {
    render(<SearchModal />);

    act(() => {
      document.dispatchEvent(new CustomEvent('open-search'));
    });

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('shows initial hint text when opened with empty query', () => {
    render(<SearchModal />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByText('キーワードを入力して検索')).toBeDefined();
  });
});
