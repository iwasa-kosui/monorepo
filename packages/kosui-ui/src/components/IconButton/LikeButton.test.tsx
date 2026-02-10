import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { LikeButton } from './LikeButton.js';

describe('LikeButton', () => {
  it('renders with default aria-label', () => {
    render(<LikeButton />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn).toBeTruthy();
  });

  it('renders heart SVG icon', () => {
    render(<LikeButton />);
    const btn = screen.getByRole('button', { name: 'Like' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies accent active color when active', () => {
    render(<LikeButton active />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn.className).toContain('kosui-icon-btn-active-accent');
  });

  it('fills heart icon when active', () => {
    render(<LikeButton active />);
    const btn = screen.getByRole('button', { name: 'Like' });
    const svg = btn.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('currentColor');
  });

  it('does not fill heart icon when not active', () => {
    render(<LikeButton />);
    const btn = screen.getByRole('button', { name: 'Like' });
    const svg = btn.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it('renders count', () => {
    render(<LikeButton count={5} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('allows custom aria-label', () => {
    render(<LikeButton aria-label='いいね' />);
    const btn = screen.getByRole('button', { name: 'いいね' });
    expect(btn).toBeTruthy();
  });

  it('applies pop animation class when active transitions false→true', () => {
    const { rerender } = render(<LikeButton active={false} />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn.className).not.toContain('kosui-icon-btn-pop');

    rerender(<LikeButton active={true} />);
    expect(btn.className).toContain('kosui-icon-btn-pop');
  });

  it('applies shrink animation class when active transitions true→false', () => {
    const { rerender } = render(<LikeButton active={true} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={false} />);
    expect(btn.className).toContain('kosui-icon-btn-shrink');
  });

  it('applies pulse class after pop animation ends (active=true idle)', () => {
    const { rerender } = render(<LikeButton active={false} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={true} />);
    expect(btn.className).toContain('kosui-icon-btn-pop');

    const iconEl = btn.querySelector('.kosui-icon-btn-icon')!;
    fireEvent.animationEnd(iconEl);
    expect(btn.className).toContain('kosui-icon-btn-pulse');
    expect(btn.className).not.toContain('kosui-icon-btn-pop');
  });

  it('does not apply animation class on initial render when active=true', () => {
    render(<LikeButton active={true} />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn.className).not.toContain('kosui-icon-btn-pop');
    expect(btn.className).not.toContain('kosui-icon-btn-shrink');
    expect(btn.className).toContain('kosui-icon-btn-pulse');
  });

  it('does not apply animation class on initial render when active=false', () => {
    render(<LikeButton active={false} />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn.className).not.toContain('kosui-icon-btn-pop');
    expect(btn.className).not.toContain('kosui-icon-btn-shrink');
    expect(btn.className).not.toContain('kosui-icon-btn-pulse');
  });

  it('removes shrink class after animation ends', () => {
    const { rerender } = render(<LikeButton active={true} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={false} />);
    expect(btn.className).toContain('kosui-icon-btn-shrink');

    const iconEl = btn.querySelector('.kosui-icon-btn-icon')!;
    fireEvent.animationEnd(iconEl);
    expect(btn.className).not.toContain('kosui-icon-btn-shrink');
    expect(btn.className).not.toContain('kosui-icon-btn-pulse');
  });

  it('shows particles during pop animation', () => {
    const { rerender } = render(<LikeButton active={false} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={true} />);
    const particles = btn.querySelectorAll('.kosui-icon-btn-particle');
    expect(particles.length).toBe(6);
  });

  it('removes particles after float timer expires', () => {
    vi.useFakeTimers();
    const { rerender } = render(<LikeButton active={false} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={true} />);
    expect(btn.querySelectorAll('.kosui-icon-btn-particle').length).toBe(6);

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(btn.querySelectorAll('.kosui-icon-btn-particle').length).toBe(0);
    vi.useRealTimers();
  });

  it('does not show particles on initial render', () => {
    render(<LikeButton active={true} />);
    const btn = screen.getByRole('button', { name: 'Like' });
    expect(btn.querySelectorAll('.kosui-icon-btn-particle').length).toBe(0);
  });

  it('does not show particles on shrink animation', () => {
    const { rerender } = render(<LikeButton active={true} />);
    const btn = screen.getByRole('button', { name: 'Like' });

    rerender(<LikeButton active={false} />);
    expect(btn.querySelectorAll('.kosui-icon-btn-particle').length).toBe(0);
  });
});
