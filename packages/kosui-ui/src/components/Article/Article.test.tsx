import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Article } from './Article.js';

describe('Article', () => {
  it('renders an article element with kosui-article class', () => {
    render(<Article data-testid='article'>Content</Article>);
    const el = screen.getByTestId('article');
    expect(el.tagName).toBe('ARTICLE');
    expect(el.className).toContain('kosui-article');
  });

  it('passes through custom className', () => {
    render(
      <Article data-testid='article' className='custom'>
        Content
      </Article>,
    );
    const el = screen.getByTestId('article');
    expect(el.className).toContain('kosui-article');
    expect(el.className).toContain('custom');
  });

  it('renders children', () => {
    render(
      <Article>
        <p>Paragraph</p>
      </Article>,
    );
    expect(screen.getByText('Paragraph')).toBeTruthy();
  });
});
