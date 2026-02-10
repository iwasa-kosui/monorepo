import type { HTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export const Card: React.FC<CardProps> = ({ className, ...props }) => {
  return <div className={cn('kosui-card', className)} {...props} />;
};

export type CardImageProps = HTMLAttributes<HTMLDivElement>;

export const CardImage: React.FC<CardImageProps> = ({
  className,
  ...props
}) => {
  return <div className={cn('kosui-card-image', className)} {...props} />;
};

export type CardBodyProps = HTMLAttributes<HTMLDivElement>;

export const CardBody: React.FC<CardBodyProps> = ({
  className,
  ...props
}) => {
  return <div className={cn('kosui-card-body', className)} {...props} />;
};

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export const CardFooter: React.FC<CardFooterProps> = ({
  className,
  ...props
}) => {
  return <div className={cn('kosui-card-footer', className)} {...props} />;
};
