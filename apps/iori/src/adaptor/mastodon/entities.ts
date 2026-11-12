import z from 'zod/v4';

export const FieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  verified_at: z.string().nullable(),
});
export type Field = z.infer<typeof FieldSchema>;

export const CustomEmojiSchema = z.object({
  shortcode: z.string(),
  url: z.string(),
  static_url: z.string(),
  visible_in_picker: z.boolean(),
  category: z.string().nullable(),
});
export type CustomEmoji = z.infer<typeof CustomEmojiSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  url: z.string(),
  uri: z.string(),
  display_name: z.string(),
  note: z.string(),
  avatar: z.string(),
  avatar_static: z.string(),
  header: z.string(),
  header_static: z.string(),
  locked: z.boolean(),
  fields: z.array(FieldSchema),
  emojis: z.array(CustomEmojiSchema),
  bot: z.boolean(),
  group: z.boolean(),
  discoverable: z.boolean().nullable(),
  indexable: z.boolean(),
  hide_collections: z.boolean().nullable(),
  created_at: z.string(),
  last_status_at: z.string().nullable(),
  statuses_count: z.number().int().nonnegative(),
  followers_count: z.number().int().nonnegative(),
  following_count: z.number().int().nonnegative(),
});
export type Account = z.infer<typeof AccountSchema>;

export const CredentialAccountSchema = AccountSchema.extend({
  source: z.object({
    note: z.string(),
    fields: z.array(FieldSchema),
    privacy: z.enum(['public', 'unlisted', 'private', 'direct']),
    sensitive: z.boolean(),
    language: z.string().nullable(),
    discoverable: z.boolean().nullable(),
    indexable: z.boolean(),
    follow_requests_count: z.number().int().nonnegative(),
  }),
});
export type CredentialAccount = z.infer<typeof CredentialAccountSchema>;

const MediaMetaSizeSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  size: z.string().optional(),
  aspect: z.number().optional(),
});

export const MediaAttachmentSchema = z.object({
  id: z.string(),
  type: z.enum(['unknown', 'image', 'gifv', 'video', 'audio']),
  url: z.string(),
  preview_url: z.string().nullable(),
  remote_url: z.string().nullable(),
  meta: z.object({
    original: MediaMetaSizeSchema.optional(),
    small: MediaMetaSizeSchema.optional(),
  }).nullable(),
  description: z.string().nullable(),
  blurhash: z.string().nullable(),
});
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

export const MentionSchema = z.object({
  id: z.string(),
  username: z.string(),
  url: z.string(),
  acct: z.string(),
});
export type Mention = z.infer<typeof MentionSchema>;

export const TagSchema = z.object({
  name: z.string(),
  url: z.string(),
  history: z.array(z.object({
    day: z.string(),
    uses: z.string(),
    accounts: z.string(),
  })).optional(),
  following: z.boolean().optional(),
});
export type Tag = z.infer<typeof TagSchema>;

export const PreviewCardSchema = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['link', 'photo', 'video', 'rich']),
  authors: z.array(z.object({
    name: z.string(),
    url: z.string(),
    account: AccountSchema.nullable(),
  })),
  author_name: z.string(),
  author_url: z.string(),
  provider_name: z.string(),
  provider_url: z.string(),
  html: z.string(),
  width: z.number(),
  height: z.number(),
  image: z.string().nullable(),
  image_description: z.string(),
  embed_url: z.string(),
  blurhash: z.string().nullable(),
});
export type PreviewCard = z.infer<typeof PreviewCardSchema>;

export const IoriBlueskyCrosspostSchema = z.object({
  status: z.enum(['pending', 'sent', 'failed', 'skipped', 'deleting']),
  skip_reason: z.enum(['content_warning', 'sensitive', 'reply_to_unsent']).nullable(),
  retrying: z.boolean(),
  url: z.string().nullable(),
});
export type IoriBlueskyCrosspost = z.infer<typeof IoriBlueskyCrosspostSchema>;

export const IoriStatusExtensionSchema = z.object({
  reactions: z.array(z.object({
    emoji: z.string(),
    count: z.number().int().nonnegative(),
    url: z.string().nullable(),
    me: z.boolean(),
  })),
  link_previews: z.array(z.object({
    url: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    site_name: z.string().nullable(),
    favicon: z.string().nullable(),
  })),
  bluesky_crosspost: IoriBlueskyCrosspostSchema.optional(),
});
export type IoriStatusExtension = z.infer<typeof IoriStatusExtensionSchema>;

export const StatusSchema = z.object({
  id: z.string(),
  uri: z.string(),
  created_at: z.string(),
  account: AccountSchema,
  content: z.string(),
  visibility: z.enum(['public', 'unlisted', 'private', 'direct']),
  sensitive: z.boolean(),
  spoiler_text: z.string(),
  media_attachments: z.array(MediaAttachmentSchema),
  mentions: z.array(MentionSchema),
  tags: z.array(TagSchema),
  emojis: z.array(CustomEmojiSchema),
  reblogs_count: z.number().int().nonnegative(),
  favourites_count: z.number().int().nonnegative(),
  replies_count: z.number().int().nonnegative(),
  url: z.string().nullable(),
  in_reply_to_id: z.string().nullable(),
  in_reply_to_account_id: z.string().nullable(),
  get reblog() {
    return StatusSchema.nullable();
  },
  poll: z.null(),
  card: PreviewCardSchema.nullable(),
  language: z.string().nullable(),
  edited_at: z.string().nullable(),
  favourited: z.boolean(),
  reblogged: z.boolean(),
  muted: z.boolean(),
  bookmarked: z.boolean(),
  pinned: z.boolean(),
  text: z.string().optional(),
  iori: IoriStatusExtensionSchema.optional(),
});
export type Status = z.infer<typeof StatusSchema>;

export const TranslationSchema = z.object({
  content: z.string(),
  spoiler_text: z.string(),
  language: z.string(),
  detected_source_language: z.string(),
  provider: z.string(),
  media_attachments: z.array(z.object({ id: z.string(), description: z.string() })),
  poll: z.null(),
});
export type Translation = z.infer<typeof TranslationSchema>;

export const NotificationTypeSchema = z.enum([
  'mention',
  'status',
  'reblog',
  'follow',
  'follow_request',
  'favourite',
  'poll',
  'update',
  'admin.sign_up',
  'admin.report',
  'severed_relationships',
  'moderation_warning',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const IORI_EMOJI_REACTION_TYPE = 'iori:emoji_reaction';

const IoriEmojiReactionExtensionSchema = z.object({
  emoji: z.string(),
  url: z.string().nullable(),
  bluesky: z.undefined().optional(),
});

const IoriBlueskyNotificationExtensionSchema = z.object({
  emoji: z.undefined().optional(),
  url: z.undefined().optional(),
  bluesky: z.object({
    reason: z.enum(['like', 'repost', 'follow', 'mention', 'reply', 'quote']),
    url: z.string(),
    text: z.string().optional(),
  }),
});

export const IoriNotificationExtensionSchema = z.union([
  IoriEmojiReactionExtensionSchema,
  IoriBlueskyNotificationExtensionSchema,
]);
export type IoriNotificationExtension = z.infer<typeof IoriNotificationExtensionSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.union([NotificationTypeSchema, z.literal(IORI_EMOJI_REACTION_TYPE)]),
  created_at: z.string(),
  account: AccountSchema,
  status: StatusSchema.optional(),
  iori: IoriNotificationExtensionSchema.optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationGroupSchema = z.object({
  group_key: z.string(),
  notifications_count: z.number().int().positive(),
  type: NotificationSchema.shape.type,
  most_recent_notification_id: z.number().int(),
  page_min_id: z.string(),
  page_max_id: z.string(),
  latest_page_notification_at: z.string(),
  sample_account_ids: z.array(z.string()),
  status_id: z.string().optional(),
  iori: IoriNotificationExtensionSchema.optional(),
});
export type NotificationGroup = z.infer<typeof NotificationGroupSchema>;

export const GroupedNotificationsResultsSchema = z.object({
  accounts: z.array(AccountSchema),
  statuses: z.array(StatusSchema),
  notification_groups: z.array(NotificationGroupSchema),
});
export type GroupedNotificationsResults = z.infer<typeof GroupedNotificationsResultsSchema>;

export const NotificationPolicySchema = z.object({
  for_not_following: z.enum(['accept', 'filter', 'drop']),
  for_not_followers: z.enum(['accept', 'filter', 'drop']),
  for_new_accounts: z.enum(['accept', 'filter', 'drop']),
  for_private_mentions: z.enum(['accept', 'filter', 'drop']),
  for_limited_accounts: z.enum(['accept', 'filter', 'drop']),
  summary: z.object({
    pending_requests_count: z.number().int().nonnegative(),
    pending_notifications_count: z.number().int().nonnegative(),
  }),
});
export type NotificationPolicy = z.infer<typeof NotificationPolicySchema>;

export const V1NotificationPolicySchema = z.object({
  filter_not_following: z.boolean(),
  filter_not_followers: z.boolean(),
  filter_new_accounts: z.boolean(),
  filter_private_mentions: z.boolean(),
  summary: z.object({
    pending_requests_count: z.number().int().nonnegative(),
    pending_notifications_count: z.number().int().nonnegative(),
  }),
});
export type V1NotificationPolicy = z.infer<typeof V1NotificationPolicySchema>;

export const ExtendedDescriptionSchema = z.object({
  updated_at: z.string().nullable(),
  content: z.string(),
});
export type ExtendedDescription = z.infer<typeof ExtendedDescriptionSchema>;

export const RelationshipSchema = z.object({
  id: z.string(),
  following: z.boolean(),
  showing_reblogs: z.boolean(),
  notifying: z.boolean(),
  languages: z.array(z.string()).nullable(),
  followed_by: z.boolean(),
  blocking: z.boolean(),
  blocked_by: z.boolean(),
  muting: z.boolean(),
  muting_notifications: z.boolean(),
  requested: z.boolean(),
  requested_by: z.boolean(),
  domain_blocking: z.boolean(),
  endorsed: z.boolean(),
  note: z.string(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  action_taken: z.boolean(),
  action_taken_at: z.string().nullable(),
  category: z.enum(['spam', 'violation', 'other']),
  comment: z.string(),
  forwarded: z.boolean(),
  created_at: z.string(),
  status_ids: z.array(z.string()).nullable(),
  rule_ids: z.array(z.string()).nullable(),
  target_account: AccountSchema,
});
export type Report = z.infer<typeof ReportSchema>;

export const ApplicationSchema = z.object({
  name: z.string(),
  website: z.string().nullable(),
  scopes: z.array(z.string()),
  redirect_uris: z.array(z.string()),
  vapid_key: z.string().optional(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const CredentialApplicationSchema = ApplicationSchema.extend({
  id: z.string(),
  client_id: z.string(),
  client_secret: z.string(),
  client_secret_expires_at: z.string(),
  redirect_uri: z.string(),
});
export type CredentialApplication = z.infer<typeof CredentialApplicationSchema>;

export const TokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  scope: z.string(),
  created_at: z.number().int().nonnegative(),
});
export type Token = z.infer<typeof TokenSchema>;

export const MarkerSchema = z.object({
  last_read_id: z.string(),
  version: z.number().int().nonnegative(),
  updated_at: z.string(),
});
export type Marker = z.infer<typeof MarkerSchema>;

export const PreferencesSchema = z.object({
  'posting:default:visibility': z.enum(['public', 'unlisted', 'private', 'direct']),
  'posting:default:sensitive': z.boolean(),
  'posting:default:language': z.string().nullable(),
  'reading:expand:media': z.enum(['default', 'show_all', 'hide_all']),
  'reading:expand:spoilers': z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

const InstanceStatusesConfigurationSchema = z.object({
  max_characters: z.number().int().positive(),
  max_media_attachments: z.number().int().nonnegative(),
  characters_reserved_per_url: z.number().int().nonnegative(),
});

const InstanceMediaAttachmentsConfigurationSchema = z.object({
  supported_mime_types: z.array(z.string()),
  image_size_limit: z.number().int().nonnegative(),
  image_matrix_limit: z.number().int().nonnegative(),
  video_size_limit: z.number().int().nonnegative(),
  video_frame_rate_limit: z.number().int().nonnegative(),
  video_matrix_limit: z.number().int().nonnegative(),
});

const InstancePollsConfigurationSchema = z.object({
  max_options: z.number().int().nonnegative(),
  max_characters_per_option: z.number().int().nonnegative(),
  min_expiration: z.number().int().nonnegative(),
  max_expiration: z.number().int().nonnegative(),
});

const InstanceRuleSchema = z.object({
  id: z.string(),
  text: z.string(),
  hint: z.string(),
});

export const InstanceV1Schema = z.object({
  uri: z.string(),
  title: z.string(),
  short_description: z.string(),
  description: z.string(),
  email: z.string(),
  version: z.string(),
  urls: z.object({
    streaming_api: z.string().optional(),
  }),
  stats: z.object({
    user_count: z.number().int().nonnegative(),
    status_count: z.number().int().nonnegative(),
    domain_count: z.number().int().nonnegative(),
  }),
  thumbnail: z.string().nullable(),
  languages: z.array(z.string()),
  registrations: z.boolean(),
  approval_required: z.boolean(),
  invites_enabled: z.boolean(),
  configuration: z.object({
    accounts: z.object({
      max_featured_tags: z.number().int().nonnegative(),
    }),
    statuses: InstanceStatusesConfigurationSchema,
    media_attachments: InstanceMediaAttachmentsConfigurationSchema,
    polls: InstancePollsConfigurationSchema,
    vapid: z.object({
      public_key: z.string(),
    }).optional(),
  }),
  contact_account: AccountSchema.nullable(),
  rules: z.array(InstanceRuleSchema),
  pleroma: z.object({
    metadata: z.object({
      post_formats: z.array(z.string()),
    }),
  }),
});
export type InstanceV1 = z.infer<typeof InstanceV1Schema>;

export const InstanceV2Schema = z.object({
  domain: z.string(),
  title: z.string(),
  version: z.string(),
  source_url: z.string(),
  description: z.string(),
  usage: z.object({
    users: z.object({
      active_month: z.number().int().nonnegative(),
    }),
  }),
  thumbnail: z.object({
    url: z.string(),
  }).nullable(),
  languages: z.array(z.string()),
  configuration: z.object({
    urls: z.object({
      streaming: z.string().optional(),
      status: z.string().optional(),
    }),
    vapid: z.object({
      public_key: z.string(),
    }).optional(),
    accounts: z.object({
      max_featured_tags: z.number().int().nonnegative(),
      max_pinned_statuses: z.number().int().nonnegative(),
    }),
    statuses: InstanceStatusesConfigurationSchema,
    media_attachments: InstanceMediaAttachmentsConfigurationSchema.extend({
      description_limit: z.number().int().nonnegative(),
    }),
    polls: InstancePollsConfigurationSchema,
    translation: z.object({
      enabled: z.boolean(),
    }),
  }),
  registrations: z.object({
    enabled: z.boolean(),
    approval_required: z.boolean(),
    message: z.string().nullable(),
    url: z.string().nullable(),
  }),
  api_versions: z.object({
    mastodon: z.number().int().nonnegative(),
  }),
  contact: z.object({
    email: z.string(),
    account: AccountSchema.nullable(),
  }),
  rules: z.array(InstanceRuleSchema),
});
export type InstanceV2 = z.infer<typeof InstanceV2Schema>;

export const ErrorBodySchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
