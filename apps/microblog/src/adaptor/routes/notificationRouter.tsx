import { RA } from "@iwasa-kosui/result";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

import { SessionId } from "../../domain/session/sessionId.ts";
import { Layout } from "../../layout.tsx";
import { NotificationsPage } from "../../ui/pages/notifications.tsx";
import { GetNotificationsUseCase } from "../../useCase/getNotifications.ts";
import { PgNotificationsReadStore } from "../pg/notification/notificationsReadStore.ts";
import { PgNotificationsResolverByUserId } from "../pg/notification/notificationsResolverByUserId.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { sanitize } from "./helper/sanitize.ts";

const app = new Hono();

app.get("/", async (c) => {
  const logger = getLogger("microblog:notifications");
  const maybeSessionId = getCookie(c, "sessionId");

  if (!maybeSessionId) {
    return c.redirect("/sign-in");
  }

  const useCase = GetNotificationsUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    notificationsResolver: PgNotificationsResolverByUserId.getInstance(),
    notificationsReadStore: PgNotificationsReadStore.getInstance(),
  });

  return RA.flow(
    RA.ok(maybeSessionId),
    RA.andThen(SessionId.parse),
    RA.andBind("result", (sessionId) => useCase.run({ sessionId })),
    RA.match({
      ok: ({ result: { user, notifications } }) => {
        const notificationsWithSanitizedContent = notifications.map((n) => ({
          notification: n,
          sanitizedContent:
            n.notification.type === "like"
              ? sanitize(
                  (n as { likedPost: { content: string } }).likedPost.content,
                )
              : "",
        }));
        console.log(notificationsWithSanitizedContent);
        return c.html(
          <NotificationsPage
            user={user}
            notifications={notificationsWithSanitizedContent}
          />,
        );
      },
      err: (err) => {
        logger.error("Get notifications failed", { error: String(err) });
        return c.html(
          <Layout>
            <section>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Error
              </h1>
              <p class="text-gray-500 dark:text-gray-400">
                Failed to load notifications. Please try again.
              </p>
              <a
                href="/sign-in"
                class="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline"
              >
                Sign in
              </a>
            </section>
          </Layout>,
          401,
        );
      },
    }),
  );
});

export const NotificationRouter = app;
