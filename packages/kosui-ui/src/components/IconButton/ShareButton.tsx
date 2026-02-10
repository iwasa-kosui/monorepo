import React from 'react';

import type { IconButtonProps } from './IconButton.js';
import { IconButton } from './IconButton.js';

export type ShareButtonProps = Omit<IconButtonProps, 'icon' | 'activeColor' | 'active'>;

const ShareIcon: React.FC = () => (
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
    <line x1='12' y1='2' x2='12' y2='15' />
    <polyline points='16 6 12 2 8 6' />
    <path d='M20 21H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h3m10 0h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1' />
  </svg>
);

export const ShareButton: React.FC<ShareButtonProps> = ({
  'aria-label': ariaLabel = 'Share',
  ...props
}) => {
  return (
    <IconButton
      icon={<ShareIcon />}
      activeColor='secondary'
      aria-label={ariaLabel}
      {...props}
    />
  );
};
