import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { createConfig } from "./server/config.ts";
import { registerTraceRoutes } from "./server/trace-routes.ts";
import { registerAgentRoutes } from "./server/agent-routes.ts";
import { registerScreenshotRoutes } from "./server/screenshot-routes.ts";

const config = createConfig();
const app = new Hono();
app.use("/*", cors());

registerTraceRoutes(app, config);
registerAgentRoutes(app, config);
registerScreenshotRoutes(app, config);

app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`observer server listening on http://localhost:${config.port}`);
