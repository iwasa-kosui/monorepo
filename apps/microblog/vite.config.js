import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";
import build from "@hono/vite-build/node";

export default defineConfig(({ mode }) => {
  if (mode === "client")
    return {
      esbuild: {
        jsxImportSource: "hono/jsx/dom",
      },
      build: {
        rollupOptions: {
          input: {
            home: "./src/ui/pages/home.tsx",
            remoteUser: "./src/ui/pages/remoteUser.tsx",
          },
          output: {
            entryFileNames: "static/[name].js",
          },
        },
      },
    };

  return {
    plugins: [
      build({
        entry: "src/index.ts",
      }),
      devServer({
        entry: "src/app.tsx",
      }),
    ],
  };
});
