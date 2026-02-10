import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Input } from './Input.js';

describe('Input', () => {
  it('renders with default state', () => {
    render(<Input data-testid='input' />);
    const el = screen.getByTestId('input');
    expect(el.tagName).toBe('INPUT');
    expect(el.className).toContain('kosui-input');
    expect(el.className).not.toContain('kosui-input-error');
    expect(el.className).not.toContain('kosui-input-success');
  });

  it('renders with error state', () => {
    render(<Input data-testid='input' state='error' />);
    const el = screen.getByTestId('input');
    expect(el.className).toContain('kosui-input-error');
  });

  it('renders with success state', () => {
    render(<Input data-testid='input' state='success' />);
    const el = screen.getByTestId('input');
    expect(el.className).toContain('kosui-input-success');
  });

  it('passes through custom className', () => {
    render(<Input data-testid='input' className='extra' />);
    const el = screen.getByTestId('input');
    expect(el.className).toContain('extra');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} data-testid='input' />);
    expect(ref.current).toBe(screen.getByTestId('input'));
  });
});
