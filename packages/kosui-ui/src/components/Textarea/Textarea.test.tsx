import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Textarea } from './Textarea.js';

describe('Textarea', () => {
  it('renders with default state', () => {
    render(<Textarea data-testid='ta' />);
    const el = screen.getByTestId('ta');
    expect(el.tagName).toBe('TEXTAREA');
    expect(el.className).toContain('kosui-textarea');
    expect(el.className).not.toContain('kosui-textarea-error');
  });

  it('renders with error state', () => {
    render(<Textarea data-testid='ta' state='error' />);
    const el = screen.getByTestId('ta');
    expect(el.className).toContain('kosui-textarea-error');
  });

  it('renders with success state', () => {
    render(<Textarea data-testid='ta' state='success' />);
    const el = screen.getByTestId('ta');
    expect(el.className).toContain('kosui-textarea-success');
  });

  it('passes through custom className', () => {
    render(<Textarea data-testid='ta' className='extra' />);
    const el = screen.getByTestId('ta');
    expect(el.className).toContain('extra');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} data-testid='ta' />);
    expect(ref.current).toBe(screen.getByTestId('ta'));
  });
});
