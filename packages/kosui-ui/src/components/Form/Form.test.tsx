import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { FormError, FormGroup, FormHint, FormLabel, FormRow } from './Form.js';

describe('Form components', () => {
  it('FormGroup renders with kosui-form-group class', () => {
    render(<FormGroup data-testid='fg'>Content</FormGroup>);
    const el = screen.getByTestId('fg');
    expect(el.className).toContain('kosui-form-group');
  });

  it('FormLabel renders a label with kosui-form-label class', () => {
    render(<FormLabel>Name</FormLabel>);
    const el = screen.getByText('Name');
    expect(el.tagName).toBe('LABEL');
    expect(el.className).toContain('kosui-form-label');
  });

  it('FormHint renders with kosui-form-hint class', () => {
    render(<FormHint>Hint text</FormHint>);
    const el = screen.getByText('Hint text');
    expect(el.className).toContain('kosui-form-hint');
  });

  it('FormError renders with kosui-form-error class', () => {
    render(<FormError>Error text</FormError>);
    const el = screen.getByText('Error text');
    expect(el.className).toContain('kosui-form-error');
  });

  it('FormRow renders with kosui-form-row class', () => {
    render(<FormRow data-testid='fr'>Content</FormRow>);
    const el = screen.getByTestId('fr');
    expect(el.className).toContain('kosui-form-row');
  });

  it('passes through custom className on all components', () => {
    render(
      <FormGroup data-testid='fg' className='custom'>
        <FormLabel className='cl'>Label</FormLabel>
        <FormHint className='ch'>Hint</FormHint>
        <FormError className='ce'>Error</FormError>
      </FormGroup>,
    );
    expect(screen.getByTestId('fg').className).toContain('custom');
    expect(screen.getByText('Label').className).toContain('cl');
    expect(screen.getByText('Hint').className).toContain('ch');
    expect(screen.getByText('Error').className).toContain('ce');
  });
});
