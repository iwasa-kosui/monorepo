import React from 'react';

import type { IconButtonProps } from './IconButton.js';
import { IconButton } from './IconButton.js';

export type ReplyButtonProps = Omit<IconButtonProps, 'icon' | 'activeColor'>;

const ReplyIcon: React.FC = () => (
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
    <polyline points='9 17 4 12 9 7' />
    <path d='M20 18v-2a4 4 0 0 0-4-4H4' />
  </svg>
);

export const ReplyButton: React.FC<ReplyButtonProps> = ({
  active = false,
  'aria-label': ariaLabel = 'Reply',
  ...props
}) => {
  return (
    <IconButton
      icon={<ReplyIcon />}
      active={active}
      activeColor='secondary'
      aria-label={ariaLabel}
      {...props}
    />
  );
};
