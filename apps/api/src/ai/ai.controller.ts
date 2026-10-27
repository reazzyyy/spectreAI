import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AiGateway, AiGatewayError } from "@spectre/ai-gateway";
import { parseSyntheticGenerate } from "./parse-synthetic-generate.js";

@Controller("ai")
export class AiController {
  constructor(@Inject(AiGateway) private readonly gateway: AiGateway) {}

  @Get("provider")
  provider(): { providerId: "synthetic"; externalTransferEnabled: false } {
    return {
      providerId: this.gateway.providerId,
      externalTransferEnabled: false,
    };
  }

  @Post("generate")
  @HttpCode(HttpStatus.OK)
  async generate(@Body() body: unknown) {
    const input = parseSyntheticGenerate(body);
    if (!input) {
      throw new UnprocessableEntityException();
    }

    try {
      const result = await this.gateway.generateText({
        operationId: input.operationId,
        dataClass: input.dataClass,
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
