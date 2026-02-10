import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { ShareButton } from './ShareButton.js';

describe('ShareButton', () => {
  it('renders with default aria-label', () => {
    render(<ShareButton />);
    const btn = screen.getByRole('button', { name: 'Share' });
    expect(btn).toBeTruthy();
  });

  it('renders share SVG icon', () => {
    render(<ShareButton />);
    const btn = screen.getByRole('button', { name: 'Share' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('does not accept active prop', () => {
    render(<ShareButton />);
    const btn = screen.getByRole('button', { name: 'Share' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('allows custom aria-label', () => {
    render(<ShareButton aria-label='共有' />);
    const btn = screen.getByRole('button', { name: '共有' });
    expect(btn).toBeTruthy();
  });
});
