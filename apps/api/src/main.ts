import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { assertAuthDatabaseRole, assertRuntimeDatabaseRole } from "@spectre/db";
import { AppModule } from "./app.module.js";
import { applyHttpMiddleware } from "./http/apply-http-middleware.js";
import { assertWebOriginConfiguredForProduction } from "./http/csrf.js";
import { assertRedisConfiguredForProduction } from "./http/rate-limit.js";

async function bootstrap(): Promise<void> {
  assertWebOriginConfiguredForProduction();
  assertRedisConfiguredForProduction();
  await assertRuntimeDatabaseRole();
  await assertAuthDatabaseRole();
  const app = await NestFactory.create(AppModule);
  applyHttpMiddleware(app);
  app.setGlobalPrefix("api/v1");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : "BOOT_FAILED");
  process.exit(1);
});
