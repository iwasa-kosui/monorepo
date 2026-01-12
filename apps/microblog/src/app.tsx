import { Hono } from "hono";
import { federation } from "@fedify/hono";
import { Federation } from "./federation.ts";
import { ResultAsync as RA } from "@iwasa-kosui/result";
import { UsersRouter } from "./adaptor/routes/usersRouter.tsx";
import { SignUpRouter } from "./adaptor/routes/signUpRouter.tsx";
import { SignInRouter } from "./adaptor/routes/signInRouter.tsx";
import { PostsRouter } from "./adaptor/routes/postsRouter.tsx";
import { FollowRouter } from "./adaptor/routes/followRouter.tsx";
import { HomeRouter } from "./adaptor/routes/homeRouter.tsx";

const app = new Hono();
const fed = Federation.getInstance();
app.use(federation(fed, () => undefined));
app.get("/authorize_interaction", (c) => {
  const url = new URL(String(c.req.url));
  url.pathname = "/follow";
  return c.redirect(url);
});
app.get("/health", (c) => c.text("OK"));
app.route("/", HomeRouter);
app.route("/users", UsersRouter);
app.route("/posts", PostsRouter);
app.route("/sign-up", SignUpRouter);
app.route("/sign-in", SignInRouter);
app.route("/follow", FollowRouter);
export default app;
