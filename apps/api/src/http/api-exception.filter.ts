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

const STABLE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * Statuses whose body used to collapse to HTTP_ERROR.
 * A server-supplied code is kept; otherwise the status has one stable code.
 * Messages stay fixed so a multer or Nest string cannot leak into the client.
 */
const MAPPED_STATUS: Record<number, ErrorBody> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "BAD_REQUEST",
    message: "Request is invalid",
  },
  [HttpStatus.CONFLICT]: {
    code: "CONFLICT",
    message: "Request conflicts with the current state",
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: "PAYLOAD_TOO_LARGE",
    message: "Payload is too large",
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: "RATE_LIMITED",
    message: "Too many requests",
  },
};

function serverCode(exception: HttpException): string | null {
  const payload = exception.getResponse();
  if (typeof payload !== "object" || payload === null || !("code" in payload)) {
    return null;
  }
  const code = payload.code;
  return typeof code === "string" && STABLE_CODE.test(code) ? code : null;
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
      if (typeof payload === "object" && payload !== null && "code" in payload) {
        if (payload.code === "AI_DATA_POLICY_BLOCKED") {
          return {
            code: "AI_DATA_POLICY_BLOCKED",
            message: "Only synthetic data is allowed",
          };
        }
        if (payload.code === "CSRF_REJECTED") {
          return {
            code: "CSRF_REJECTED",
            message: "CSRF validation failed",
          };
        }
      }
      return { code: "FORBIDDEN", message: "Operation is not allowed" };
    }
    if (
      status === HttpStatus.SERVICE_UNAVAILABLE &&
      exception instanceof HttpException &&
      serverCode(exception) === "RATE_LIMIT_UNAVAILABLE"
    ) {
      return {
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Rate limit is unavailable",
      };
    }
    if (status >= 500) {
      return { code: "INTERNAL_ERROR", message: "Unexpected error" };
    }
    const mapped = MAPPED_STATUS[status];
    if (mapped) {
      const code =
        exception instanceof HttpException ? serverCode(exception) : null;
      return { code: code ?? mapped.code, message: mapped.message };
    }
    return { code: "HTTP_ERROR", message: "Request failed" };
  }
}
