import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Card, CardBody, CardFooter, CardImage } from './Card.js';

describe('Card', () => {
  it('renders with kosui-card class', () => {
    render(<Card data-testid='card'>Content</Card>);
    const el = screen.getByTestId('card');
    expect(el.className).toContain('kosui-card');
  });

  it('CardImage renders with kosui-card-image class', () => {
    render(<CardImage data-testid='img'>Img</CardImage>);
    const el = screen.getByTestId('img');
    expect(el.className).toContain('kosui-card-image');
  });

  it('CardBody renders with kosui-card-body class', () => {
    render(<CardBody data-testid='body'>Body</CardBody>);
    const el = screen.getByTestId('body');
    expect(el.className).toContain('kosui-card-body');
  });

  it('CardFooter renders with kosui-card-footer class', () => {
    render(<CardFooter data-testid='footer'>Footer</CardFooter>);
    const el = screen.getByTestId('footer');
    expect(el.className).toContain('kosui-card-footer');
  });

  it('composes into a full card', () => {
    render(
      <Card data-testid='card'>
        <CardImage data-testid='img' />
        <CardBody data-testid='body'>
          <h4>Title</h4>
          <p>Description</p>
        </CardBody>
        <CardFooter data-testid='footer'>
          <span>Date</span>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByTestId('img')).toBeTruthy();
    expect(screen.getByTestId('body')).toBeTruthy();
    expect(screen.getByTestId('footer')).toBeTruthy();
    expect(screen.getByText('Title')).toBeTruthy();
  });

  it('passes through custom className', () => {
    render(
      <Card data-testid='card' className='custom'>
        Content
      </Card>,
    );
    const el = screen.getByTestId('card');
    expect(el.className).toContain('custom');
    expect(el.className).toContain('kosui-card');
  });
});
