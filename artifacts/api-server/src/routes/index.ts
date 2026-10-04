import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import uploadsRouter from "./uploads";
import { requireAuth } from "../middlewares/requireAuth";
import conversationsRouter from "./conversations";
import repliesRouter from "./replies";
import preferencesRouter from "./preferences";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(uploadsRouter);
router.use(requireAuth);
router.use("/conversations", conversationsRouter);
router.use("/replies", repliesRouter);
router.use(preferencesRouter);

export default router;
