import type { HTMLAttributes, LabelHTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

export type FormGroupProps = HTMLAttributes<HTMLDivElement>;

export const FormGroup: React.FC<FormGroupProps> = ({
  className,
  ...props
}) => {
  return <div className={cn('kosui-form-group', className)} {...props} />;
};

export type FormLabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const FormLabel: React.FC<FormLabelProps> = ({
  className,
  ...props
}) => {
  return <label className={cn('kosui-form-label', className)} {...props} />;
};

export type FormHintProps = HTMLAttributes<HTMLSpanElement>;

export const FormHint: React.FC<FormHintProps> = ({
  className,
  ...props
}) => {
  return <span className={cn('kosui-form-hint', className)} {...props} />;
};

export type FormErrorProps = HTMLAttributes<HTMLSpanElement>;

export const FormError: React.FC<FormErrorProps> = ({
  className,
  ...props
}) => {
  return <span className={cn('kosui-form-error', className)} {...props} />;
};

export type FormRowProps = HTMLAttributes<HTMLDivElement>;

export const FormRow: React.FC<FormRowProps> = ({ className, ...props }) => {
  return <div className={cn('kosui-form-row', className)} {...props} />;
};
