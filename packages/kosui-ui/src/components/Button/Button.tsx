import type { ButtonHTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'outlineSecondary'
  | 'ghost'
  | 'danger';

type ButtonSize = 'sm' | 'default' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'kosui-btn-primary',
  secondary: 'kosui-btn-secondary',
  outline: 'kosui-btn-outline',
  outlineSecondary: 'kosui-btn-outlineSecondary',
  ghost: 'kosui-btn-ghost',
  danger: 'kosui-btn-danger',
};

const sizeClass: Record<ButtonSize, string | undefined> = {
  sm: 'kosui-btn-sm',
  default: undefined,
  lg: 'kosui-btn-lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'default',
  className,
  ...props
}) => {
  return (
    <button
      className={cn(
        'kosui-btn',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
};
