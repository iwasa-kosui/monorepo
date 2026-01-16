import type { RemoteActor } from "../../domain/actor/remoteActor.ts";
import { RemoteActor as RemoteActorDomain } from "../../domain/actor/remoteActor.ts";
import { Layout } from "../../layout.tsx";

type Props = Readonly<{
  remoteActor: RemoteActor;
  isFollowing: boolean;
  isLoggedIn: boolean;
}>;

export const GetRemoteUserPage = ({
  remoteActor,
  isFollowing,
  isLoggedIn,
}: Props) => {
  const handle = RemoteActorDomain.getHandle(remoteActor) ?? remoteActor.uri;
  const displayName = remoteActor.username ?? handle;

  return (
    <Layout>
      <section class="mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {remoteActor.logoUri ? (
                <img
                  src={remoteActor.logoUri}
                  alt="User Logo"
                  class="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div class="flex-1">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {displayName}
              </h1>
              <p class="text-gray-500 dark:text-gray-400">@{handle}</p>
            </div>
          </div>

          {remoteActor.url && (
            <div class="mb-4">
              <a
                href={remoteActor.url}
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-500 hover:text-blue-600 hover:underline text-sm"
              >
                View original profile
              </a>
            </div>
          )}

          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            {isLoggedIn ? (
              isFollowing ? (
                <form method="post" action={`/remote-users/${remoteActor.id}/unfollow`}>
                  <button
                    type="submit"
                    class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Unfollow
                  </button>
                </form>
              ) : (
                <form method="post" action={`/remote-users/${remoteActor.id}/follow`}>
                  <button
                    type="submit"
                    class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Follow
                  </button>
                </form>
              )
            ) : (
              <p class="text-gray-500 dark:text-gray-400 text-sm">
                <a href="/sign-in" class="text-blue-500 hover:underline">Sign in</a> to follow this user
              </p>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};
