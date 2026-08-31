import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
import router from "./routes";
import { logger } from "./lib/logger";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

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

// Restrict CORS to known frontend origins — never reflect arbitrary origins
// with credentials, as that enables CSRF attacks on authed endpoints.
const allowedOrigins = new Set<string>();

// Always allow localhost in development
["http://localhost", "http://127.0.0.1"].forEach((o) => allowedOrigins.add(o));

// Allow Replit dev domain when present (includes port variants from Vite proxy)
const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
if (replitDevDomain) {
  allowedOrigins.add(`https://${replitDevDomain}`);
}

// Allow Replit Expo dev domain (mobile app web preview runs on a separate subdomain)
const expoDevDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
if (expoDevDomain) {
  allowedOrigins.add(`https://${expoDevDomain}`);
}

// Additional explicit allowlist via env var (comma-separated, for production)
const extraOrigins = process.env.ALLOWED_ORIGINS ?? "";
extraOrigins.split(",").filter(Boolean).forEach((o) => allowedOrigins.add(o.trim()));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server (no origin) and same-origin requests
      if (!origin) return callback(null, true);
      // Allow any localhost port (Vite dev server uses random ports)
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";

// Trust the first reverse-proxy hop (Replit's load balancer) so that
// req.secure is set correctly when behind HTTPS termination in production.
if (isProduction) {
  app.set("trust proxy", 1);
}

// Persistent PostgreSQL session store — survives process restarts and works
// across multiple instances in autoscaled deployments.
const PgStore = pgSession(session);
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(
  session({
    store: new PgStore({
      pool: sessionPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // SameSite=Lax prevents CSRF for same-site deployments (Replit path routing
      // serves both frontend and API from the same domain, so Lax is sufficient).
      // We avoid SameSite=None which would re-introduce CSRF risk.
      sameSite: "lax",
      secure: isProduction, // HTTPS-only cookies in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

export default app;
