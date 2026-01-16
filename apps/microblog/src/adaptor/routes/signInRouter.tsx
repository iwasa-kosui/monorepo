import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { Layout } from "../../layout.tsx";
import { Username } from "../../domain/user/username.ts";
import { Password } from "../../domain/password/password.ts";
import z from "zod/v4";
import { getLogger } from "@logtape/logtape";
import { PgUserResolverByUsername } from "../pg/user/userResolverByUsername.ts";
import { Federation } from "../../federation.ts";
import { RA } from "@iwasa-kosui/result";
import { PgSessionStartedStore } from "../pg/session/sessionStartedStore.ts";
import { PgUserPasswordResolver } from "../pg/userPassword/userPasswordResolver.ts";
import { SignInUseCase } from "../../useCase/signIn.ts";
import { setCookie } from "hono/cookie";

const app = new Hono();
app.get("/", async (c) => {
  return c.html(
    <Layout>
      <section class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign in</h1>
        <form method="post" action="/sign-in" class="space-y-4">
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
              placeholder="Password"
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
            Sign in
          </button>
        </form>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
          Don't have an account?{" "}
          <a href="/sign-up" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
            Sign up
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
    const logger = getLogger("microblog:sign-in");
    logger.info("Sign in attempt", { username: form.username });

    const useCase = SignInUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userPasswordResolver: PgUserPasswordResolver.getInstance(),
      sessionStartedStore: PgSessionStartedStore.getInstance(),
    });
    const onOk = (v: { sessionId: string }) => {
      logger.info("Sign in successful", { username: form.username });
      setCookie(c, "sessionId", v.sessionId, {
        httpOnly: true,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
        secure: true,
      });
      return c.redirect("/");
    };
    const onErr = (e: { type: "UsernameOrPasswordInvalid" }) => {
      logger.warn("Sign in failed", { error: e });
      return c.html(
        <Layout>
          <section class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign in</h1>
            <div class="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <p class="text-red-700 dark:text-red-300 text-sm">
                Sign in failed: Invalid username or password
              </p>
            </div>
            <form method="post" action="/sign-in" class="space-y-4">
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
                  placeholder="Password"
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
                Sign in
              </button>
            </form>
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
              Don't have an account?{" "}
              <a href="/sign-up" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                Sign up
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

export { app as SignInRouter };
