import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { IconButton } from './IconButton.js';

describe('IconButton', () => {
  it('renders with icon', () => {
    render(<IconButton icon={<span data-testid='icon'>★</span>} aria-label='Star' />);
    expect(screen.getByTestId('icon')).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('kosui-icon-btn');
  });

  it('defaults to type="button"', () => {
    render(<IconButton icon='★' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('sets aria-pressed=false when not active', () => {
    render(<IconButton icon='★' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('sets aria-pressed=true when active', () => {
    render(<IconButton icon='★' active aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('applies active color class when active', () => {
    render(<IconButton icon='★' active activeColor='success' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('kosui-icon-btn-active-success');
  });

  it('does not apply active color class when not active', () => {
    render(<IconButton icon='★' activeColor='success' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).not.toContain('kosui-icon-btn-active-success');
  });

  it('renders count when provided', () => {
    render(<IconButton icon='★' count={42} aria-label='Star' />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders count of 0', () => {
    render(<IconButton icon='★' count={0} aria-label='Star' />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('does not render count when not provided', () => {
    render(<IconButton icon='★' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    const countEl = btn.querySelector('.kosui-icon-btn-count');
    expect(countEl).toBeNull();
  });

  it('applies sm size class', () => {
    render(<IconButton icon='★' size='sm' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('kosui-icon-btn-sm');
  });

  it('applies lg size class', () => {
    render(<IconButton icon='★' size='lg' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('kosui-icon-btn-lg');
  });

  it('passes through disabled attribute', () => {
    render(<IconButton icon='★' disabled aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('passes through custom className', () => {
    render(<IconButton icon='★' className='extra' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('extra');
    expect(btn.className).toContain('kosui-icon-btn');
  });

  it('applies animationClass to button', () => {
    render(<IconButton icon='★' animationClass='kosui-icon-btn-pop' aria-label='Star' />);
    const btn = screen.getByRole('button', { name: 'Star' });
    expect(btn.className).toContain('kosui-icon-btn-pop');
  });

  it('calls onIconAnimationEnd when icon animation ends', () => {
    let called = false;
    render(
      <IconButton
        icon='★'
        aria-label='Star'
        onIconAnimationEnd={() => {
          called = true;
        }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Star' });
    const iconEl = btn.querySelector('.kosui-icon-btn-icon')!;
    fireEvent.animationEnd(iconEl);
    expect(called).toBe(true);
  });

  it('adds count-pop class when count changes', () => {
    const { rerender } = render(<IconButton icon='★' count={5} aria-label='Star' />);
    const countEl = screen.getByText('5');
    expect(countEl.className).not.toContain('kosui-icon-btn-count-pop');

    rerender(<IconButton icon='★' count={6} aria-label='Star' />);
    const countEl2 = screen.getByText('6');
    expect(countEl2.className).toContain('kosui-icon-btn-count-pop');
  });

  it('removes count-pop class after animation ends', () => {
    const { rerender } = render(<IconButton icon='★' count={5} aria-label='Star' />);
    rerender(<IconButton icon='★' count={6} aria-label='Star' />);
    const countEl = screen.getByText('6');
    expect(countEl.className).toContain('kosui-icon-btn-count-pop');

    fireEvent.animationEnd(countEl);
    expect(countEl.className).not.toContain('kosui-icon-btn-count-pop');
  });

  it('does not add count-pop class on initial render', () => {
    render(<IconButton icon='★' count={5} aria-label='Star' />);
    const countEl = screen.getByText('5');
    expect(countEl.className).not.toContain('kosui-icon-btn-count-pop');
  });
});
