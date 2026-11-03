import type { Relationship } from './entities.ts';

export type ToRelationshipProps = Readonly<{
  id: string;
  following: boolean;
  followedBy: boolean;
  muting: boolean;
}>;

export const toRelationship = (props: ToRelationshipProps): Relationship => ({
  id: props.id,
  following: props.following,
  showing_reblogs: true,
  notifying: false,
  languages: null,
  followed_by: props.followedBy,
  blocking: false,
  blocked_by: false,
  muting: props.muting,
  muting_notifications: false,
  requested: false,
  requested_by: false,
  domain_blocking: false,
  endorsed: false,
  note: '',
});
