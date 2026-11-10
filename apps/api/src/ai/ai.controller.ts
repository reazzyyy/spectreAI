import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { AiGateway, AiGatewayError } from "@spectre/ai-gateway";
import { ACTOR_CONTEXT, type ActorContext } from "../auth/actor-context.js";
import { ActorGuard } from "../auth/actor.guard.js";
import { assertRateLimit } from "../http/rate-limit.js";
import { parseSyntheticGenerate } from "./parse-synthetic-generate.js";

@Controller("ai")
export class AiController {
  constructor(
    @Inject(AiGateway) private readonly gateway: AiGateway,
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  @Get("provider")
  provider(): { providerId: "synthetic"; externalTransferEnabled: false } {
    return {
      providerId: this.gateway.providerId,
      externalTransferEnabled: false,
    };
  }

  @Post("generate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ActorGuard)
  async generate(@Body() body: unknown) {
    if (!this.actor) {
      throw new UnauthorizedException();
    }
    await assertRateLimit(
      "ai_generate",
      `${this.actor.organizationId}:${this.actor.userId}`,
    );

    const input = parseSyntheticGenerate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }

    try {
      // Server-derived data class only (D-012). Client claim ignored for policy.
      const result = await this.gateway.generateText({
        operationId: input.operationId,
        dataClass: "synthetic",
        messages: [{ role: "user", content: input.content }],
      });
      return {
        providerId: result.providerId,
        modelId: result.modelId,
        synthetic: result.synthetic,
        text: result.text,
      };
    } catch (error) {
      if (error instanceof AiGatewayError && error.code === "AI_DATA_POLICY_BLOCKED") {
        throw new ForbiddenException({ code: "AI_DATA_POLICY_BLOCKED" });
      }
      throw error;
    }
  }
}
