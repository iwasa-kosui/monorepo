import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { Layout } from "../../layout.tsx";
import { Username } from "../../domain/user/username.ts";
import { Password } from "../../domain/password/password.ts";
import z from "zod/v4";
import { getLogger } from "@logtape/logtape";
import { SignUpUseCase } from "../../useCase/signUp.ts";
import { PgUserResolverByUsername } from "../pg/user/userResolverByUsername.ts";
import { PgUserCreatedStore } from "../pg/user/userCreatedStore.ts";
import { PgLocalActorCreatedStore } from "../pg/actor/localActorCreatedStore.ts";
import { PgUserPasswordSetStore } from "../pg/userPassword/userPasswordSetStore.ts";
import type {
  UnacceptableUsernameError,
  User,
  UsernameAlreadyTakenError,
} from "../../domain/user/user.ts";
import { Federation } from "../../federation.ts";
import { RA } from "@iwasa-kosui/result";

const app = new Hono();

app.get("/", async (c) => {
  return c.html(
    <Layout>
      <section class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign up</h1>
        <form method="post" action="/sign-up" class="space-y-4">
          <div>
            <input
              type="text"
              name="username"
              placeholder="Username"
              required
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <input
              type="password"
              name="password"
              placeholder="Password (min 16 characters)"
              required
              minlength={16}
              maxlength={255}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Sign up
          </button>
        </form>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
          Already have an account?{" "}
          <a href="/sign-in" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
            Sign in
          </a>
        </p>
      </section>
    </Layout>
  );
});

app.post(
  "/",
  sValidator(
    "form",
    z.object({
      username: Username.zodType,
      password: Password.zodType,
    })
  ),
  async (c) => {
    const form = c.req.valid("form");
    const logger = getLogger("microblog:sign-up");
    logger.info("Sign up attempt", { username: form.username });

    const useCase = SignUpUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userCreatedStore: PgUserCreatedStore.getInstance(),
      localActorCreatedStore: PgLocalActorCreatedStore.getInstance(),
      userPasswordSetStore: PgUserPasswordSetStore.getInstance(),
    });

    const onOk = (v: { user: User }) => {
      logger.info("Sign up successful", { username: v.user.username });
      return c.html(
        <Layout>
          <section class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign up</h1>
            <div class="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
              <p class="text-green-700 dark:text-green-300 text-sm">
                Sign up successful for username: {String(v.user.username)}
              </p>
            </div>
            <a
              href="/sign-in"
              class="block w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-center"
            >
              Go to Sign in
            </a>
          </section>
        </Layout>
      );
    };

    const onErr = (
      e: UsernameAlreadyTakenError | UnacceptableUsernameError
    ) => {
      logger.warn("Sign up failed", { error: e });
      return c.html(
        <Layout>
          <section class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign up</h1>
            <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <p class="text-red-700 dark:text-red-300 text-sm">
                Sign up failed: {e.message}
              </p>
            </div>
            <form method="post" action="/sign-up" class="space-y-4">
              <div>
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  required
                  class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <input
                  type="password"
                  name="password"
                  placeholder="Password (min 16 characters)"
                  required
                  minlength={16}
                  maxlength={255}
                  class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Sign up
              </button>
            </form>
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
              Already have an account?{" "}
              <a href="/sign-in" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                Sign in
              </a>
            </p>
          </section>
        </Layout>
      );
    };

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    return RA.flow(
      useCase.run({ username: form.username, password: form.password, ctx }),
      RA.match({
        ok: onOk,
        err: onErr,
      })
    );
  }
);

export { app as SignUpRouter };
