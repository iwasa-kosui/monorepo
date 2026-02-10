import type { TextareaHTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

type TextareaState = 'default' | 'error' | 'success';

export type TextareaProps =
  & Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'state'
  >
  & {
    readonly state?: TextareaState;
  };

const stateClass: Record<TextareaState, string | undefined> = {
  default: undefined,
  error: 'kosui-textarea-error',
  success: 'kosui-textarea-success',
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ state = 'default', className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn('kosui-textarea', stateClass[state], className)}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
