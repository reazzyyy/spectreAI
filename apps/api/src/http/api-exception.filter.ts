import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

interface ErrorBody {
  code: string;
  message: string;
}

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const requestId = randomUUID();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toBody(exception, status);

    response.status(status).json({
      error: {
        code: body.code,
        message: body.message,
        requestId,
      },
    });
  }

  private toBody(exception: unknown, status: number): ErrorBody {
    if (status === HttpStatus.UNAUTHORIZED) {
      return { code: "UNAUTHENTICATED", message: "Authentication is required" };
    }
    if (status === HttpStatus.NOT_FOUND) {
      return { code: "NOT_FOUND", message: "Resource not found" };
    }
    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      return { code: "VALIDATION_ERROR", message: "Request validation failed" };
    }
    if (status === HttpStatus.FORBIDDEN && exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "code" in payload &&
        payload.code === "AI_DATA_POLICY_BLOCKED"
      ) {
        return {
          code: "AI_DATA_POLICY_BLOCKED",
          message: "Only synthetic data is allowed",
        };
      }
      return { code: "FORBIDDEN", message: "Operation is not allowed" };
    }
    if (status >= 500) {
      return { code: "INTERNAL_ERROR", message: "Unexpected error" };
    }
    return { code: "HTTP_ERROR", message: "Request failed" };
  }
}
