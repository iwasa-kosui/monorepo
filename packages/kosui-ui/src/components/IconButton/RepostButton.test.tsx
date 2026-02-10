import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { RepostButton } from './RepostButton.js';

describe('RepostButton', () => {
  it('renders with default aria-label', () => {
    render(<RepostButton />);
    const btn = screen.getByRole('button', { name: 'Repost' });
    expect(btn).toBeTruthy();
  });

  it('renders repost SVG icon', () => {
    render(<RepostButton />);
    const btn = screen.getByRole('button', { name: 'Repost' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies success active color when active', () => {
    render(<RepostButton active />);
    const btn = screen.getByRole('button', { name: 'Repost' });
    expect(btn.className).toContain('kosui-icon-btn-active-success');
  });

  it('renders count', () => {
    render(<RepostButton count={10} />);
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('allows custom aria-label', () => {
    render(<RepostButton aria-label='リポスト' />);
    const btn = screen.getByRole('button', { name: 'リポスト' });
    expect(btn).toBeTruthy();
  });
});
