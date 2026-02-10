import React from 'react';

import type { IconButtonProps } from './IconButton.js';
import { IconButton } from './IconButton.js';

export type RepostButtonProps = Omit<IconButtonProps, 'icon' | 'activeColor'>;

const RepostIcon: React.FC = () => (
  <svg
    width='18'
    height='18'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <polyline points='17 1 21 5 17 9' />
    <path d='M3 11V9a4 4 0 0 1 4-4h14' />
    <polyline points='7 23 3 19 7 15' />
    <path d='M21 13v2a4 4 0 0 1-4 4H3' />
  </svg>
);

export const RepostButton: React.FC<RepostButtonProps> = ({
  active = false,
  'aria-label': ariaLabel = 'Repost',
  ...props
}) => {
  return (
    <IconButton
      icon={<RepostIcon />}
      active={active}
      activeColor='success'
      aria-label={ariaLabel}
      {...props}
    />
  );
};
