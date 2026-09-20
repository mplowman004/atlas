import { Router, type IRouter } from "express";
import healthRouter from "./health";
import atlasRouter from "./atlas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(atlasRouter);

export default router;
