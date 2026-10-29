import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";

/** Shared Express middleware for API bootstrap and e2e. */
export function applyHttpMiddleware(app: INestApplication): void {
  app.use(cookieParser());
}
