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
      <section>
        <h1>Sign up</h1>
        <form method="post" action="/sign-up">
          <input type="text" name="username" placeholder="Username" required />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            minlength={16}
            maxlength={255}
          />
          <button type="submit">Sign up</button>
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
          <section>
            <h1>Sign up</h1>
            <p>Sign up successful for username: {String(v.user.username)}</p>
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
          <section>
            <h1>Sign up</h1>
            <p>Sign up failed: {e.message}</p>
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
