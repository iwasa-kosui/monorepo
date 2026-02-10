import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge.js';

describe('Badge', () => {
  it('renders with default variant (coral)', () => {
    render(<Badge>Tag</Badge>);
    const el = screen.getByText('Tag');
    expect(el.className).toContain('kosui-badge');
    expect(el.className).toContain('kosui-badge-coral');
  });

  it('renders with ocean variant', () => {
    render(<Badge variant='ocean'>Ocean</Badge>);
    const el = screen.getByText('Ocean');
    expect(el.className).toContain('kosui-badge-ocean');
  });

  it('renders with lg size', () => {
    render(<Badge size='lg'>Large</Badge>);
    const el = screen.getByText('Large');
    expect(el.className).toContain('kosui-badge-lg');
  });

  it('does not add size class for default size', () => {
    render(<Badge size='default'>Default</Badge>);
    const el = screen.getByText('Default');
    expect(el.className).not.toContain('kosui-badge-lg');
  });

  it('passes through custom className', () => {
    render(<Badge className='extra'>Tag</Badge>);
    const el = screen.getByText('Tag');
    expect(el.className).toContain('extra');
  });
});
