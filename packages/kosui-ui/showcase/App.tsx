import React, { useCallback, useState } from 'react';

import {
  Article,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardImage,
  FormError,
  FormGroup,
  FormHint,
  FormLabel,
  FormRow,
  Heading,
  Input,
  Textarea,
} from '../src/index.js';

type Theme = 'light' | 'dark';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('light');

  const handleTheme = useCallback((t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute(
      'data-theme',
      t === 'dark' ? 'dark' : '',
    );
  }, []);

  return (
    <>
      {/* Header */}
      <div className='showcase-header'>
        <h1>kosui-ui Showcase</h1>
        <p>Coral & Ocean Design System</p>
      </div>

      {/* Theme Toggle */}
      <div className='showcase-toolbar'>
        <button
          data-active={theme === 'light'}
          onClick={() => handleTheme('light')}
        >
          Light
        </button>
        <button
          data-active={theme === 'dark'}
          onClick={() => handleTheme('dark')}
        >
          Dark
        </button>
      </div>

      <div className='showcase-container'>
        {/* Color Palette */}
        <section>
          <div className='showcase-section-label'>Color Palette</div>
          <div className='showcase-palette'>
            {[
              { color: 'var(--kosui-bg-main)', label: 'BG', dark: true },
              {
                color: 'var(--kosui-bg-secondary)',
                label: 'Surface',
                dark: true,
              },
              { color: 'var(--kosui-text-main)', label: 'Text' },
              { color: 'var(--kosui-text-secondary)', label: 'Sub' },
              { color: 'var(--kosui-accent)', label: 'Coral' },
              { color: 'var(--kosui-accent-light)', label: 'Light' },
              { color: 'var(--kosui-secondary)', label: 'Ocean' },
              { color: 'var(--kosui-secondary-light)', label: 'Light' },
              { color: 'var(--kosui-success)', label: 'OK' },
              { color: 'var(--kosui-error)', label: 'Err' },
              { color: 'var(--kosui-border)', label: 'Border', dark: true },
              { color: 'var(--kosui-code-bg)', label: 'Code' },
            ].map((item, i) => (
              <div
                key={i}
                className='showcase-palette-item'
                style={{ background: item.color }}
              >
                <span
                  style={
                    item.dark
                      ? { color: 'var(--kosui-text-tertiary)' }
                      : undefined
                  }
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <div className='showcase-section-label'>Headings — H1 / H2 / H3</div>
          <div className='showcase-stack' style={{ gap: '1.5rem' }}>
            <div>
              <Heading level={1}>H1: Coral & Ocean</Heading>
              <p
                style={{
                  color: 'var(--kosui-text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                font-size: 2rem / font-weight: 800 / letter-spacing: -0.01em
              </p>
            </div>
            <div>
              <Heading level={2}>H2: Railway Oriented Programming</Heading>
              <p
                style={{
                  color: 'var(--kosui-text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                font-size: 1.5rem / font-weight: 700 / border-bottom: accent
              </p>
            </div>
            <div>
              <Heading level={3}>H3: Branded Type</Heading>
              <p
                style={{
                  color: 'var(--kosui-text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                font-size: 1.2rem / font-weight: 700 / border-left: accent
              </p>
            </div>
          </div>
        </section>

        {/* Article */}
        <section>
          <div className='showcase-section-label'>Article</div>
          <Article>
            <h2>Result型によるエラーハンドリング</h2>
            <p>
              TypeScriptで堅牢なアプリケーションを構築するにあたり、
              <strong>Railway Oriented Programming</strong>
              （ROP）は非常に有効なパターンです。従来の<code>try-catch</code>
              構文では、エラーの型情報が失われてしまいます。
            </p>
            <blockquote>
              "Make illegal states unrepresentable"
              — 不正な状態を表現不可能にすることで、バグの入り込む余地を根本から排除する。
            </blockquote>
            <h3>基本的な使い方</h3>
            <p>
              以下は、ユーザー入力のバリデーションから保存までを一貫した
              <code>pipe</code>で繋ぐ例です：
            </p>
            <pre>
              {`const createPost = (input: CreatePostInput): ResultAsync<Post, ValidationError> =>
  pipe(
    ResultAsync.ok(input),
    ResultAsync.andThen(validateTitle),
    ResultAsync.andThen(checkDuplicate),
    ResultAsync.map(Post.create),
    ResultAsync.andThrough(store.save),
  );`}
            </pre>
            <p>このパターンの利点：</p>
            <ul>
              <li>
                各ステップのエラー型が<strong>合成</strong>
                され、最終的な戻り値の型に反映される
              </li>
              <li>
                途中のステップが失敗すると、後続のステップは自動的にスキップされる
              </li>
              <li>
                <code>andThrough</code>
                を使えば、副作用を挟みつつパイプラインの値を維持できる
              </li>
            </ul>
          </Article>
        </section>

        {/* Buttons */}
        <section>
          <div className='showcase-section-label'>Button</div>
          <div className='showcase-stack'>
            <div>
              <p className='showcase-sub-label'>
                Primary / Secondary / Outline / Ghost / Danger
              </p>
              <div className='showcase-row'>
                <Button variant='primary'>Coral Primary</Button>
                <Button variant='secondary'>Ocean Secondary</Button>
                <Button variant='outline'>Outline</Button>
                <Button variant='outlineSecondary'>Outline Ocean</Button>
                <Button variant='ghost'>Ghost</Button>
                <Button variant='danger'>Danger</Button>
              </div>
            </div>
            <div>
              <p className='showcase-sub-label'>Sizes: Small / Default / Large</p>
              <div className='showcase-row'>
                <Button variant='primary' size='sm'>
                  Small
                </Button>
                <Button variant='primary'>Default</Button>
                <Button variant='primary' size='lg'>
                  Large
                </Button>
              </div>
            </div>
            <div>
              <p className='showcase-sub-label'>Disabled</p>
              <div className='showcase-row'>
                <Button variant='primary' disabled>
                  Disabled
                </Button>
                <Button variant='outline' disabled>
                  Disabled
                </Button>
                <Button variant='ghost' disabled>
                  Disabled
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Cards */}
        <section>
          <div className='showcase-section-label'>Card</div>
          <div className='showcase-card-grid'>
            <Card>
              <CardImage
                style={{
                  background:
                    'linear-gradient(135deg, var(--kosui-accent), var(--kosui-accent-light))',
                }}
              >
                <svg
                  width='40'
                  height='40'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='#fff'
                  strokeWidth='1.5'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5'
                  />
                </svg>
              </CardImage>
              <CardBody>
                <h4>Result 型ライブラリ</h4>
                <p>
                  Railway Oriented Programming を TypeScript
                  で実現するための軽量ライブラリ。
                </p>
                <div className='showcase-row' style={{ gap: '0.5rem' }}>
                  <Badge variant='coralSubtle'>TypeScript</Badge>
                  <Badge variant='oceanSubtle'>OSS</Badge>
                </div>
              </CardBody>
              <CardFooter>
                <span>2026.02.08</span>
                <Button variant='primary' size='sm'>
                  詳細を見る
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardImage
                style={{
                  background:
                    'linear-gradient(135deg, var(--kosui-secondary), var(--kosui-secondary-light))',
                }}
              >
                <svg
                  width='40'
                  height='40'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='#fff'
                  strokeWidth='1.5'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375'
                  />
                </svg>
              </CardImage>
              <CardBody>
                <h4>Event-Driven Architecture</h4>
                <p>
                  ドメインイベントを活用した疎結合なマイクロサービス設計パターン。
                </p>
                <div className='showcase-row' style={{ gap: '0.5rem' }}>
                  <Badge variant='oceanSubtle'>Architecture</Badge>
                  <Badge variant='success'>Published</Badge>
                </div>
              </CardBody>
              <CardFooter>
                <span>2026.01.22</span>
                <Button variant='outline' size='sm'>
                  詳細を見る
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardImage
                style={{
                  background:
                    'linear-gradient(135deg, var(--kosui-success), #6AAA8A)',
                }}
              >
                <svg
                  width='40'
                  height='40'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='#fff'
                  strokeWidth='1.5'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    d='M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z'
                  />
                </svg>
              </CardImage>
              <CardBody>
                <h4>Always-Valid Domain Model</h4>
                <p>
                  Branded Type と Zod
                  で不正な状態を型レベルで排除する実践ガイド。
                </p>
                <div className='showcase-row' style={{ gap: '0.5rem' }}>
                  <Badge variant='coralSubtle'>Zod</Badge>
                  <Badge variant='outline'>Draft</Badge>
                </div>
              </CardBody>
              <CardFooter>
                <span>2026.01.15</span>
                <Button variant='ghost' size='sm'>
                  下書き
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Badges */}
        <section>
          <div className='showcase-section-label'>Badge</div>
          <div className='showcase-stack' style={{ gap: '1rem' }}>
            <div>
              <p className='showcase-sub-label'>Filled</p>
              <div className='showcase-row' style={{ gap: '0.5rem' }}>
                <Badge variant='coral'>Coral</Badge>
                <Badge variant='ocean'>Ocean</Badge>
                <Badge variant='success'>Success</Badge>
                <Badge variant='error'>Error</Badge>
              </div>
            </div>
            <div>
              <p className='showcase-sub-label'>Subtle</p>
              <div className='showcase-row' style={{ gap: '0.5rem' }}>
                <Badge variant='coralSubtle'>TypeScript</Badge>
                <Badge variant='oceanSubtle'>Architecture</Badge>
                <Badge variant='success'>Published</Badge>
                <Badge variant='error'>Deprecated</Badge>
                <Badge variant='outline'>Draft</Badge>
              </div>
            </div>
            <div>
              <p className='showcase-sub-label'>Large</p>
              <div className='showcase-row' style={{ gap: '0.5rem' }}>
                <Badge variant='coral' size='lg'>
                  v2.0.0
                </Badge>
                <Badge variant='oceanSubtle' size='lg'>
                  {'Result<T, E>'}
                </Badge>
                <Badge variant='outline' size='lg'>
                  Experimental
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Input / Textarea */}
        <section>
          <div className='showcase-section-label'>Input / Textarea</div>
          <div className='showcase-form-grid'>
            <FormRow>
              <FormGroup>
                <FormLabel>タイトル</FormLabel>
                <Input placeholder='記事のタイトルを入力...' />
              </FormGroup>
              <FormGroup>
                <FormLabel>スラッグ</FormLabel>
                <Input defaultValue='railway-oriented-programming' />
                <FormHint>URLに使用されるIDです</FormHint>
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <FormLabel>カテゴリ（エラー状態）</FormLabel>
                <Input state='error' defaultValue='' />
                <FormError>カテゴリは必須です</FormError>
              </FormGroup>
              <FormGroup>
                <FormLabel>著者（成功状態）</FormLabel>
                <Input state='success' defaultValue='kosui' />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <FormLabel>本文</FormLabel>
              <Textarea
                rows={5}
                placeholder={'Markdownで記事の本文を入力...\n\n## 見出し\n本文テキスト...'}
              />
            </FormGroup>

            <FormGroup>
              <FormLabel>メモ（無効状態）</FormLabel>
              <Textarea rows={3} disabled defaultValue='この項目は現在編集できません。' />
            </FormGroup>

            <div className='showcase-form-actions'>
              <Button variant='ghost'>キャンセル</Button>
              <Button variant='outlineSecondary'>下書き保存</Button>
              <Button variant='primary'>公開する</Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};
