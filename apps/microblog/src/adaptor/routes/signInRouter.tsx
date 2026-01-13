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
      <section>
        <h1>Sign in</h1>
        <form method="post" action="/sign-in">
          <input type="text" name="username" placeholder="Username" required />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            minlength={16}
            maxlength={255}
          />
          <button type="submit">Sign in</button>
        </form>
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
          <section>
            <h1>Sign in</h1>
            <p>Sign in failed: {e}</p>
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
