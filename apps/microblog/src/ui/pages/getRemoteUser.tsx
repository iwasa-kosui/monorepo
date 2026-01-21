import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { RemoteActor as RemoteActorDomain } from '../../domain/actor/remoteActor.ts';
import { Layout } from '../../layout.tsx';

type Props = Readonly<{
  remoteActor: RemoteActor;
  isFollowing: boolean;
  isLoggedIn: boolean;
}>;

export const GetRemoteUserPage = ({
  remoteActor,
  isFollowing,
  isLoggedIn = false,
}: Props) => {
  const handle = RemoteActorDomain.getHandle(remoteActor) ?? remoteActor.uri;
  const displayName = remoteActor.username ?? handle;

  return (
    <Layout isLoggedIn={isLoggedIn}>
      <div class='flex items-center justify-between mb-6'>
        <a href='/' class='text-2xl font-bold text-gray-900 dark:text-white hover:opacity-80 transition-opacity'>
          blog.kosui.me
        </a>
        <a
          href='/about'
          class='text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
        >
          ioriについて
        </a>
      </div>
      <section class='mb-8'>
        <div class='bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6'>
          <div class='flex items-center gap-4 mb-4'>
            <div class='w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-2xl font-bold flex-shrink-0'>
              {remoteActor.logoUri
                ? (
                  <img
                    src={remoteActor.logoUri}
                    alt='User Logo'
                    class='w-16 h-16 rounded-2xl object-cover'
                  />
                )
                : (
                  displayName.charAt(0).toUpperCase()
                )}
            </div>
            <div class='flex-1'>
              <h1 class='text-2xl font-bold text-gray-900 dark:text-white'>
                {displayName}
              </h1>
              <p class='text-gray-500 dark:text-gray-400'>@{handle}</p>
            </div>
          </div>

          <div class='flex items-center gap-3'>
            {isLoggedIn
              ? (
                isFollowing
                  ? (
                    <form method='post' action={`/remote-users/${remoteActor.id}/unfollow`} class='m-0'>
                      <button
                        type='submit'
                        class='flex items-center justify-center p-2 rounded-xl text-blue-500 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                        title='フォロー解除'
                      >
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          class='h-5 w-5'
                          fill='none'
                          viewBox='0 0 24 24'
                          stroke='currentColor'
                          stroke-width='2'
                        >
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M15 11l2 2 4-4'
                          />
                        </svg>
                      </button>
                    </form>
                  )
                  : (
                    <form method='post' action={`/remote-users/${remoteActor.id}/follow`} class='m-0'>
                      <button
                        type='submit'
                        class='flex items-center justify-center p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                        title='フォロー'
                      >
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          class='h-5 w-5'
                          fill='none'
                          viewBox='0 0 24 24'
                          stroke='currentColor'
                          stroke-width='2'
                        >
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                          />
                          <path
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            d='M19 10h-2m-2 0h2m0 0V8m0 2v2'
                          />
                        </svg>
                      </button>
                    </form>
                  )
              )
              : (
                <p class='text-gray-500 dark:text-gray-400 text-sm'>
                  <a href='/sign-in' class='text-gray-700 dark:text-gray-300 hover:underline'>Sign in</a>{' '}
                  to follow this user
                </p>
              )}
            {remoteActor.url && (
              <a
                href={remoteActor.url}
                target='_blank'
                rel='noopener noreferrer'
                class='flex items-center justify-center p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                title='元のプロフィールを表示'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  class='h-5 w-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  stroke-width='2'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};
