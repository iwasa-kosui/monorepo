import type { HTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

type BadgeVariant =
  | 'coral'
  | 'coralSubtle'
  | 'ocean'
  | 'oceanSubtle'
  | 'success'
  | 'error'
  | 'outline';

type BadgeSize = 'default' | 'lg';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
};

const variantClass: Record<BadgeVariant, string> = {
  coral: 'kosui-badge-coral',
  coralSubtle: 'kosui-badge-coralSubtle',
  ocean: 'kosui-badge-ocean',
  oceanSubtle: 'kosui-badge-oceanSubtle',
  success: 'kosui-badge-success',
  error: 'kosui-badge-error',
  outline: 'kosui-badge-outline',
};

const sizeClass: Record<BadgeSize, string | undefined> = {
  default: undefined,
  lg: 'kosui-badge-lg',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'coral',
  size = 'default',
  className,
  ...props
}) => {
  return (
    <span
      className={cn(
        'kosui-badge',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
};
