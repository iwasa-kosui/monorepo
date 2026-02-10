import type { ButtonHTMLAttributes, ReactNode } from 'react';
import React, { useEffect, useRef, useState } from 'react';

import { cn } from '../../utils/cn.js';

type IconButtonActiveColor = 'accent' | 'success' | 'secondary' | 'error';

type IconButtonSize = 'sm' | 'default' | 'lg';

export type IconButtonProps =
  & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>
  & {
    readonly icon: ReactNode;
    readonly active?: boolean;
    readonly count?: number;
    readonly activeColor?: IconButtonActiveColor;
    readonly size?: IconButtonSize;
    readonly animationClass?: string;
    readonly onIconAnimationEnd?: () => void;
  };

const activeColorClass: Record<IconButtonActiveColor, string> = {
  accent: 'kosui-icon-btn-active-accent',
  success: 'kosui-icon-btn-active-success',
  secondary: 'kosui-icon-btn-active-secondary',
  error: 'kosui-icon-btn-active-error',
};

const sizeClass: Record<IconButtonSize, string | undefined> = {
  sm: 'kosui-icon-btn-sm',
  default: undefined,
  lg: 'kosui-icon-btn-lg',
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  active = false,
  count,
  activeColor = 'accent',
  size = 'default',
  animationClass,
  onIconAnimationEnd,
  className,
  ...props
}) => {
  const prevCountRef = useRef(count);
  const isFirstRenderRef = useRef(true);
  const [countPop, setCountPop] = useState(false);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (prevCountRef.current !== count) {
      setCountPop(true);
      prevCountRef.current = count;
    }
  }, [count]);

  return (
    <button
      type='button'
      aria-pressed={active}
      className={cn(
        'kosui-icon-btn',
        active && activeColorClass[activeColor],
        sizeClass[size],
        animationClass,
        className,
      )}
      {...props}
    >
      <span className='kosui-icon-btn-icon' onAnimationEnd={onIconAnimationEnd}>
        {icon}
      </span>
      {count !== undefined && (
        <span
          className={cn('kosui-icon-btn-count', countPop && 'kosui-icon-btn-count-pop')}
          onAnimationEnd={() => setCountPop(false)}
        >
          {count}
        </span>
      )}
    </button>
  );
};
