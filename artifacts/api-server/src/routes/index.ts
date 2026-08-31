import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import flatsRouter from "./flats";
import reservationsRouter from "./reservations";
import cleaningRouter from "./cleaning";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import periodicTasksRouter from "./periodic-tasks";
import observationsRouter from "./observations";
import analyticsRouter from "./analytics";
import notificationsRouter from "./notifications";
import pushTokensRouter from "./push-tokens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(flatsRouter);
router.use(reservationsRouter);
router.use(cleaningRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(periodicTasksRouter);
router.use(observationsRouter);
router.use(analyticsRouter);
router.use(notificationsRouter);
router.use(pushTokensRouter);

export default router;
