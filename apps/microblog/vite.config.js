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
          input: "./src/ui/pages/home.tsx",
          output: {
            entryFileNames: "static/home.js",
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
