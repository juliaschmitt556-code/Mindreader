import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis";
import repliesRouter from "./replies";
import { limitAiRequests } from "../lib/ai/rateLimit";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/analysis", limitAiRequests, analysisRouter);
router.use("/replies", limitAiRequests, repliesRouter);

export default router;
