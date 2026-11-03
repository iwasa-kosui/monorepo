import type { Account, InstanceV1, InstanceV2 } from './entities.ts';

export type BuildInstanceProps = Readonly<{
  domain: string;
  title: string;
  description: string;
  ioriVersion: string;
  contactAccount: Account | null;
  vapidPublicKey: string | null;
  contactEmail?: string;
  thumbnailUrl?: string;
}>;

const SOURCE_URL = 'https://github.com/iwasa-kosui/monorepo';
const languages = (): string[] => ['ja', 'en'];

const toVersion = (ioriVersion: string): string => `4.3.0 (compatible; iori ${ioriVersion})`;

export const MAX_STATUS_CHARACTERS = 10000;

const statuses = {
  max_characters: MAX_STATUS_CHARACTERS,
  max_media_attachments: 4,
  characters_reserved_per_url: 23,
} as const;

const mediaAttachments = () => ({
  supported_mime_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  image_size_limit: 5242880,
  image_matrix_limit: 33177600,
  video_size_limit: 0,
  video_frame_rate_limit: 0,
  video_matrix_limit: 0,
});

const polls = {
  max_options: 2,
  max_characters_per_option: 1,
  min_expiration: 300,
  max_expiration: 300,
} as const;

const vapidOf = (vapidPublicKey: string | null) =>
  vapidPublicKey === null ? {} : { vapid: { public_key: vapidPublicKey } };

export const buildInstanceV2 = (props: BuildInstanceProps): InstanceV2 => ({
  domain: props.domain,
  title: props.title,
  version: toVersion(props.ioriVersion),
  source_url: SOURCE_URL,
  description: props.description,
  usage: { users: { active_month: 1 } },
  thumbnail: props.thumbnailUrl === undefined ? null : { url: props.thumbnailUrl },
  languages: languages(),
  configuration: {
    urls: {},
    ...vapidOf(props.vapidPublicKey),
    accounts: { max_featured_tags: 0, max_pinned_statuses: 0 },
    statuses: { ...statuses },
    media_attachments: { ...mediaAttachments(), description_limit: 1500 },
    polls: { ...polls },
    translation: { enabled: false },
  },
  registrations: { enabled: false, approval_required: false, message: null, url: null },
  api_versions: { mastodon: 2 },
  contact: { email: props.contactEmail ?? '', account: props.contactAccount },
  rules: [],
});

export const buildInstanceV1 = (props: BuildInstanceProps): InstanceV1 => ({
  uri: props.domain,
  title: props.title,
  short_description: props.description,
  description: props.description,
  email: props.contactEmail ?? '',
  version: toVersion(props.ioriVersion),
  urls: {},
  stats: { user_count: 1, status_count: 0, domain_count: 0 },
  thumbnail: props.thumbnailUrl ?? null,
  languages: languages(),
  registrations: false,
  approval_required: false,
  invites_enabled: false,
  configuration: {
    accounts: { max_featured_tags: 0 },
    statuses: { ...statuses },
    media_attachments: mediaAttachments(),
    polls: { ...polls },
    ...vapidOf(props.vapidPublicKey),
  },
  contact_account: props.contactAccount,
  rules: [],
  pleroma: { metadata: { post_formats: ['text/plain', 'text/markdown'] } },
});
