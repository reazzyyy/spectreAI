import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { assertRuntimeDatabaseRole } from "@spectre/db";
import { AppModule } from "./app.module.js";
import { applyHttpMiddleware } from "./http/apply-http-middleware.js";
import { assertWebOriginConfiguredForProduction } from "./http/csrf.js";

async function bootstrap(): Promise<void> {
  assertWebOriginConfiguredForProduction();
  await assertRuntimeDatabaseRole();
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
