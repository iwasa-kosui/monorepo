# iori (庵)

A lightweight, self-hosted microblogging platform for individuals or small groups, with full ActivityPub federation support.

> **庵 (iori)** - A small, cozy retreat. Your personal space on the Fediverse.

## Features

- **ActivityPub Federation** - Connect with Mastodon, Misskey, and other Fediverse platforms
- **Single/Small Group Focus** - Designed for personal blogs or small communities
- **Remote Follow** - Allow users from other servers to follow you easily
- **Timeline** - Home timeline with posts from people you follow
- **Notifications** - Follow notifications with Web Push support
- **Markdown Support** - Write posts with rich formatting
- **Image Attachments** - Share images with your posts
- **Dark Mode** - Automatic dark/light theme based on system preference

## Tech Stack

- **Runtime**: Node.js
- **Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework
- **Federation**: [Fedify](https://fedify.dev/) - ActivityPub server framework
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: [Zod](https://zod.dev/) - Schema-driven validation
- **Build**: [Vite](https://vite.dev/)

## Getting Started

### Prerequisites

- Node.js 24.x
- pnpm
- PostgreSQL 15+

### Setup

1. Start the database:

```bash
pnpm compose:up
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `ORIGIN` - Your server's origin URL (e.g., `https://example.com`)

3. Run database migrations:

```bash
pnpm drizzle:push
```

4. Start the development server:

```bash
pnpm dev
```

## Development

```bash
# Start dev server
pnpm dev

# Run tests
pnpm test

# Lint and format
pnpm lint:fix
pnpm format

# Type check
pnpm exec tsc --noEmit

# Build for production
pnpm build
```

## Documentation

詳細なドキュメントは `docs/` ディレクトリを参照してください。

### RDRA（要件定義）

| ドキュメント                                          | 内容                                     |
| ----------------------------------------------------- | ---------------------------------------- |
| [System Value](docs/rdra/system-value.md)             | プロダクトビジョン、アクター、要求・要件 |
| [System Environment](docs/rdra/system-environment.md) | 利用シーン、ビジネスユースケース         |
| [Information Model](docs/rdra/information-model.md)   | ドメインモデル、集約、イベント           |
| [State Model](docs/rdra/state-model.md)               | 状態遷移、ビジネスルール                 |

### 開発者向けリソース

| ドキュメント     | 内容                   |
| ---------------- | ---------------------- |
| [ADR](docs/adr/) | アーキテクチャ決定記録 |

## Architecture

```
src/
├── adaptor/       # Infrastructure layer (routes, database, federation)
├── domain/        # Domain models and business logic
├── useCase/       # Application use cases
├── ui/            # UI components and pages
├── federation.ts  # ActivityPub federation setup
└── app.tsx        # Application entry point
```

## License

MIT
