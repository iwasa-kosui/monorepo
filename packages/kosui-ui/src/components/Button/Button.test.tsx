import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders with default variant (primary) and default size', () => {
    render(<Button>Click</Button>);
    const el = screen.getByText('Click');
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toContain('kosui-btn');
    expect(el.className).toContain('kosui-btn-primary');
    expect(el.className).not.toContain('kosui-btn-sm');
    expect(el.className).not.toContain('kosui-btn-lg');
  });

  it('renders with secondary variant', () => {
    render(<Button variant='secondary'>Btn</Button>);
    const el = screen.getByText('Btn');
    expect(el.className).toContain('kosui-btn-secondary');
  });

  it('renders with sm size', () => {
    render(<Button size='sm'>Small</Button>);
    const el = screen.getByText('Small');
    expect(el.className).toContain('kosui-btn-sm');
  });

  it('renders with lg size', () => {
    render(<Button size='lg'>Large</Button>);
    const el = screen.getByText('Large');
    expect(el.className).toContain('kosui-btn-lg');
  });

  it('passes through disabled attribute', () => {
    render(<Button disabled>Disabled</Button>);
    const el = screen.getByText('Disabled') as HTMLButtonElement;
    expect(el.disabled).toBe(true);
  });

  it('passes through custom className', () => {
    render(<Button className='extra'>Btn</Button>);
    const el = screen.getByText('Btn');
    expect(el.className).toContain('extra');
    expect(el.className).toContain('kosui-btn');
  });
});
