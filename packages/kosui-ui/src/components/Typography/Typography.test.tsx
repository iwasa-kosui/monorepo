import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Heading } from './Typography.js';

describe('Heading', () => {
  it('renders an h1 with kosui-h1 class', () => {
    render(<Heading level={1}>Title</Heading>);
    const el = screen.getByText('Title');
    expect(el.tagName).toBe('H1');
    expect(el.className).toContain('kosui-h1');
  });

  it('renders an h2 with kosui-h2 class', () => {
    render(<Heading level={2}>Subtitle</Heading>);
    const el = screen.getByText('Subtitle');
    expect(el.tagName).toBe('H2');
    expect(el.className).toContain('kosui-h2');
  });

  it('renders an h3 with kosui-h3 class', () => {
    render(<Heading level={3}>Section</Heading>);
    const el = screen.getByText('Section');
    expect(el.tagName).toBe('H3');
    expect(el.className).toContain('kosui-h3');
  });

  it('passes through custom className', () => {
    render(
      <Heading level={1} className='custom'>
        Title
      </Heading>,
    );
    const el = screen.getByText('Title');
    expect(el.className).toContain('kosui-h1');
    expect(el.className).toContain('custom');
  });
});
