import { Actor } from '../../domain/actor/actor.ts';
import { LocalActor } from '../../domain/actor/localActor.ts';
import { RemoteActor } from '../../domain/actor/remoteActor.ts';

export const ActorLink = ({ actor }: { actor: Actor }) => {
  const handle = Actor.match({
    onLocal: LocalActor.getHandle,
    onRemote: (x) => RemoteActor.getHandle(x) ?? actor.uri,
  })(actor);

  return (
    <a
      href={Actor.match({
        onLocal: (x) => x.uri,
        onRemote: (x) => `/remote-users/${x.id}`,
      })(actor)}
      class='flex items-center gap-2 p-2 rounded-xl hover:bg-sand-light dark:hover:bg-gray-700 transition-colors'
    >
      <div class='w-8 h-8 blob-avatar bg-terracotta dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-clay-sm'>
        {actor.logoUri
          ? (
            <img
              src={actor.logoUri}
              alt='Actor Logo'
              class='w-8 h-8 rounded-full object-cover'
            />
          )
          : (
            handle.charAt(0).toUpperCase()
          )}
      </div>
      <span class='text-sm text-charcoal dark:text-gray-300 truncate'>
        {handle}
      </span>
    </a>
  );
};
