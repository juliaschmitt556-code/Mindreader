import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));

app.use("/api", router);
app.use((error: { type?: string; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.type === "entity.too.large") {
    res.status(413).json({ error: "The request is too large. Keep screenshots under 10 MB." });
    return;
  }
  if (error.status === 400) {
    res.status(400).json({ error: "The request body must be valid JSON." });
    return;
  }
  logger.error({ status: error.status }, "API request failed");
  res.status(500).json({ error: "ReplyMind could not complete this request." });
});

export default app;
