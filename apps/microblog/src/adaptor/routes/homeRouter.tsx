import { LayoutClient } from "../../layout.tsx";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";

const app = new Hono();

app.get("/", (c) => {
  const sessionId = getCookie(c, "sessionId");
  if (!sessionId) {
    return c.redirect("/users/kosui");
  }
  return c.html(
    <LayoutClient client="/static/home.js" server="/src/ui/pages/home.tsx">
      <div id="root" />
    </LayoutClient>
  );
});

export { app as HomeRouter };
