import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { applyHttpMiddleware } from "./http/apply-http-middleware.js";
import { assertWebOriginConfiguredForProduction } from "./http/csrf.js";

async function bootstrap(): Promise<void> {
  assertWebOriginConfiguredForProduction();
  const app = await NestFactory.create(AppModule);
  applyHttpMiddleware(app);
  app.setGlobalPrefix("api/v1");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
