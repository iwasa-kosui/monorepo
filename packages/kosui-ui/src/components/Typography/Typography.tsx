import type { HTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

type HeadingLevel = 1 | 2 | 3;

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  readonly level: HeadingLevel;
};

const levelToClass: Record<HeadingLevel, string> = {
  1: 'kosui-h1',
  2: 'kosui-h2',
  3: 'kosui-h3',
};

export const Heading: React.FC<HeadingProps> = ({
  level,
  className,
  ...props
}) => {
  const Tag = `h${level}` as const;
  return <Tag className={cn(levelToClass[level], className)} {...props} />;
};
