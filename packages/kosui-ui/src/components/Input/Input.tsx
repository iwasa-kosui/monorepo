import type { InputHTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

type InputState = 'default' | 'error' | 'success';

export type InputProps =
  & Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'state'
  >
  & {
    readonly state?: InputState;
  };

const stateClass: Record<InputState, string | undefined> = {
  default: undefined,
  error: 'kosui-input-error',
  success: 'kosui-input-success',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ state = 'default', className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn('kosui-input', stateClass[state], className)}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
