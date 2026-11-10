import type { MiddlewareHandler } from 'hono';
import type { Hono } from 'hono';

export type IoriAppAdapters = Readonly<{
  federationMiddleware: MiddlewareHandler | undefined;
  registerRoutes?: (app: Hono) => void;
  serveAsset: (request: Request) => Promise<Response | undefined>;
  servePage?: (request: Request) => Promise<Response | undefined>;
  serveUpload: (filename: string) => Promise<Response | undefined>;
  serveOgImage: (request: Request) => Promise<Response>;
}>;
