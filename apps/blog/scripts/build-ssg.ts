import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distClient = path.resolve(root, "dist/client");
const distServer = path.resolve(root, "dist/server");

async function buildSSG() {
  const template = fs.readFileSync(
    path.resolve(distClient, "index.html"),
    "utf-8",
  );

  const { render, getRoutes } = await import(
    path.resolve(distServer, "entry-server.js")
  ) as {
    render: (url: string) => string;
    getRoutes: () => string[];
  };

  const routes = getRoutes();
  console.log(`Generating ${routes.length} pages...`);

  for (const route of routes) {
    const html = render(route);
    const page = template.replace("<!--ssr-outlet-->", html);

    const filePath =
      route === "/"
        ? path.resolve(distClient, "index.html")
        : path.resolve(distClient, route.slice(1), "index.html");

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, page);
    console.log(`  Generated: ${route}`);
  }

  // Copy to dist root for deployment
  const distRoot = path.resolve(root, "dist");
  if (distClient !== distRoot) {
    copyDir(distClient, distRoot);
  }

  console.log("SSG build complete!");
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

buildSSG().catch((err) => {
  console.error("SSG build failed:", err);
  process.exit(1);
});
