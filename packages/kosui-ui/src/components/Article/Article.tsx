import type { HTMLAttributes } from 'react';
import React from 'react';

import { cn } from '../../utils/cn.js';

export type ArticleProps = HTMLAttributes<HTMLElement>;

export const Article: React.FC<ArticleProps> = ({ className, ...props }) => {
  return <article className={cn('kosui-article', className)} {...props} />;
};
