# iori

A personal knowledge management platform connected to the Fediverse

> **Iori (庵)** — A small hermitage for quiet contemplation, weaving knowledge, and connecting with the world

[日本語版 README](README.ja.md)

## Concept

iori provides a "**second brain connected to collective intelligence**" — not just recording and organizing your daily thoughts, but also **collecting knowledge from others** through the Fediverse and **sharing your own knowledge**.

### Why Build This?

- Own your **personal knowledge base** without depending on large platforms
- **Accumulate, organize, and systematize** thoughts instead of letting them slip away
- **Collect knowledge from others** via the Fediverse and merge it with your own
- **Share and publish** accumulated knowledge when needed

## Key Features

### Knowledge Collection

| Feature  | Description                                                         | Status      |
| -------- | ------------------------------------------------------------------- | ----------- |
| Follow   | Subscribe to interesting users and receive their notes continuously | Implemented |
| Bookmark | Save useful notes for later reference and organization              | Not yet     |
| Quote    | Incorporate others' notes with your own thoughts added              | Not yet     |

### Knowledge Accumulation & Organization

| Feature          | Description                                     | Status      |
| ---------------- | ----------------------------------------------- | ----------- |
| Notes            | Record fleeting thoughts and memos (short-form) | Implemented |
| Threads          | Develop thinking through replies to notes       | Implemented |
| Articles         | Long-form content that compiles threads         | Implemented |
| Full-text Search | Search through accumulated knowledge            | Not yet     |
| Tags             | Categorize notes and articles with tags         | Not yet     |

### Knowledge Sharing

| Feature         | Description                                                 | Status      |
| --------------- | ----------------------------------------------------------- | ----------- |
| ActivityPub     | Interoperate with Mastodon, Misskey, and others             | Implemented |
| Like & Repost   | React to others' notes                                      | Implemented |
| Emoji Reactions | React with custom emojis                                    | Implemented |
| Notifications   | Follow, like, and reply notifications with Web Push support | Implemented |

## Tech Stack

| Category   | Technology                                            |
| ---------- | ----------------------------------------------------- |
| Runtime    | Node.js                                               |
| Framework  | [Hono](https://hono.dev/)                             |
| Federation | [Fedify](https://fedify.dev/)                         |
| Database   | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/) |
| Validation | [Zod](https://zod.dev/)                               |
| Build      | [Vite](https://vite.dev/)                             |

## Setup

### Requirements

- Node.js 24.x
- pnpm
- PostgreSQL 15+

### Installation

1. Start the database

```bash
pnpm compose:up
```

2. Configure environment variables

```bash
cp .env.example .env
# Edit .env
```

Required environment variables:

| Variable       | Description                                     |
| -------------- | ----------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string                    |
| `ORIGIN`       | Server origin URL (e.g., `https://example.com`) |

3. Run database migrations

```bash
pnpm drizzle:push
```

4. Start development server

```bash
pnpm dev
```

## Development

```bash
# Start development server
pnpm dev

# Run tests
pnpm test

# Lint & Format
pnpm lint:fix
pnpm format

# Type check
pnpm exec tsc --noEmit

# Production build
pnpm build
```

## Architecture

```
src/
├── adaptor/       # Infrastructure layer (routing, DB, federation)
├── domain/        # Domain models, business logic
├── useCase/       # Application use cases
├── ui/            # UI components, pages
├── federation.ts  # ActivityPub configuration
└── app.tsx        # Entry point
```

## Documentation

See the `docs/` directory for detailed documentation.

### RDRA (Requirements Definition)

| Document                                              | Contents                             |
| ----------------------------------------------------- | ------------------------------------ |
| [System Value](docs/rdra/system-value.md)             | Product vision, actors, requirements |
| [System Environment](docs/rdra/system-environment.md) | Usage scenarios, business use cases  |
| [Information Model](docs/rdra/information-model.md)   | Domain model, aggregates, events     |
| [State Model](docs/rdra/state-model.md)               | State transitions, business rules    |

### For Developers

| Document         | Contents                      |
| ---------------- | ----------------------------- |
| [ADR](docs/adr/) | Architecture Decision Records |

## Glossary

| Term        | Definition                                           |
| ----------- | ---------------------------------------------------- |
| **Note**    | Short text for recording daily thoughts              |
| **Thread**  | A chain of replies to notes; developing thoughts     |
| **Article** | A compilation of threads; the trajectory of thinking |

## License

MIT
