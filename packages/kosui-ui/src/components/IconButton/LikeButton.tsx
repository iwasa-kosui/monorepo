import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { IconButtonProps } from './IconButton.js';
import { IconButton } from './IconButton.js';

export type LikeButtonProps = Omit<IconButtonProps, 'icon' | 'activeColor'>;

type AnimationState = 'idle' | 'pop' | 'shrink';

const animationClassMap: Record<AnimationState, string | undefined> = {
  idle: undefined,
  pop: 'kosui-icon-btn-pop',
  shrink: 'kosui-icon-btn-shrink',
};

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

const HeartIcon: React.FC<{ readonly filled: boolean }> = ({ filled }) => (
  <svg
    width='18'
    height='18'
    viewBox='0 0 24 24'
    fill={filled ? 'currentColor' : 'none'}
    stroke='currentColor'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    <path d={HEART_PATH} />
  </svg>
);

const MiniHeart: React.FC<{ readonly style: React.CSSProperties }> = ({ style }) => (
  <svg
    className='kosui-icon-btn-particle'
    style={style}
    width='8'
    height='8'
    viewBox='0 0 24 24'
    fill='currentColor'
    aria-hidden='true'
  >
    <path d={HEART_PATH} />
  </svg>
);

const PARTICLE_FLOAT_MS = 1200;

const PARTICLE_PATHS = [
  // arcs gently right then up
  { x1: '6px', y1: '-7px', x2: '4px', y2: '-16px', x3: '8px', y3: '-24px', dur: '1s', delay: '0s' },
  // arcs left then up
  { x1: '-7px', y1: '-9px', x2: '-5px', y2: '-19px', x3: '-3px', y3: '-28px', dur: '1.1s', delay: '0.03s' },
  // S-curve: right then left
  { x1: '5px', y1: '-6px', x2: '-4px', y2: '-14px', x3: '2px', y3: '-20px', dur: '0.9s', delay: '0.06s' },
  // S-curve: left then right
  { x1: '-4px', y1: '-8px', x2: '6px', y2: '-17px', x3: '-1px', y3: '-26px', dur: '1.05s', delay: '0.02s' },
  // nearly straight up, tiny wobble
  { x1: '2px', y1: '-10px', x2: '-2px', y2: '-18px', x3: '1px', y3: '-22px', dur: '0.95s', delay: '0.08s' },
  // wide sway, shorter rise
  { x1: '-8px', y1: '-5px', x2: '5px', y2: '-12px', x3: '-6px', y3: '-18px', dur: '1.15s', delay: '0.05s' },
] as const;

export const LikeButton: React.FC<LikeButtonProps> = ({
  active = false,
  'aria-label': ariaLabel = 'Like',
  ...props
}) => {
  const prevActiveRef = useRef(active);
  const isFirstRenderRef = useRef(true);
  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (active !== prevActiveRef.current) {
      const nextAnim = active ? 'pop' : 'shrink';
      setAnimState(nextAnim);
      if (nextAnim === 'pop') {
        setShowParticles(true);
      }
      prevActiveRef.current = active;
    }
  }, [active]);

  useEffect(() => {
    if (!showParticles) return;
    const timer = setTimeout(() => setShowParticles(false), PARTICLE_FLOAT_MS);
    return () => clearTimeout(timer);
  }, [showParticles]);

  const handleIconAnimationEnd = useCallback(() => {
    setAnimState('idle');
  }, []);

  const resolvedAnimClass = animState !== 'idle'
    ? animationClassMap[animState]
    : active
    ? 'kosui-icon-btn-pulse'
    : undefined;

  return (
    <IconButton
      icon={
        <>
          <HeartIcon filled={active} />
          {showParticles && PARTICLE_PATHS.map((p, i) => (
            <MiniHeart
              key={i}
              style={{
                '--x1': p.x1,
                '--y1': p.y1,
                '--x2': p.x2,
                '--y2': p.y2,
                '--x3': p.x3,
                '--y3': p.y3,
                '--dur': p.dur,
                '--delay': p.delay,
              } as React.CSSProperties}
            />
          ))}
        </>
      }
      active={active}
      activeColor='accent'
      aria-label={ariaLabel}
      animationClass={resolvedAnimClass}
      onIconAnimationEnd={handleIconAnimationEnd}
      {...props}
    />
  );
};
