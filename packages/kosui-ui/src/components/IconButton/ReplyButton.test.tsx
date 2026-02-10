import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { ReplyButton } from './ReplyButton.js';

describe('ReplyButton', () => {
  it('renders with default aria-label', () => {
    render(<ReplyButton />);
    const btn = screen.getByRole('button', { name: 'Reply' });
    expect(btn).toBeTruthy();
  });

  it('renders reply SVG icon', () => {
    render(<ReplyButton />);
    const btn = screen.getByRole('button', { name: 'Reply' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies secondary active color when active', () => {
    render(<ReplyButton active />);
    const btn = screen.getByRole('button', { name: 'Reply' });
    expect(btn.className).toContain('kosui-icon-btn-active-secondary');
  });

  it('renders count', () => {
    render(<ReplyButton count={3} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('allows custom aria-label', () => {
    render(<ReplyButton aria-label='返信' />);
    const btn = screen.getByRole('button', { name: '返信' });
    expect(btn).toBeTruthy();
  });
});
