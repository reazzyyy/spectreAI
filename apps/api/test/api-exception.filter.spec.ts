import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ApiExceptionFilter } from "../src/http/api-exception.filter.js";

function capture(exception: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const filter = new ApiExceptionFilter();
  let status = 0;
  let body: { error?: { code?: string; message?: string } } = {};
  const response = {
    status(code: number) {
      status = code;
      return response;
    },
    json(payload: { error?: { code?: string; message?: string } }) {
      body = payload;
    },
  };
  filter.catch(exception, {
    switchToHttp: () => ({ getResponse: () => response }),
  } as never);
  return {
    status,
    code: body.error?.code ?? "",
    message: body.error?.message ?? "",
  };
}

describe("API error codes", () => {
  it("keeps the existing authentication code", () => {
    expect(capture(new UnauthorizedException())).toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("maps an unlabeled conflict to CONFLICT", () => {
    expect(capture(new ConflictException())).toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("keeps a server rate-limit code instead of HTTP_ERROR", () => {
    const result = capture(
      new HttpException(
        { code: "RATE_LIMITED", message: "Too many requests" },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    expect(result).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(result.message).not.toContain("stack");
  });

  it("maps an oversized payload to PAYLOAD_TOO_LARGE", () => {
    expect(capture(new PayloadTooLargeException("File too large"))).toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("maps an unlabeled bad request to BAD_REQUEST and keeps a server code", () => {
    expect(capture(new BadRequestException("Unexpected file"))).toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
    });
    expect(
      capture(
        new HttpException({ code: "QUOTE_MISMATCH" }, HttpStatus.BAD_REQUEST),
      ),
    ).toMatchObject({ status: 400, code: "QUOTE_MISMATCH" });
  });

  it("ignores a code that is not a stable token", () => {
    expect(
      capture(
        new HttpException({ code: "not a code" }, HttpStatus.CONFLICT),
      ),
    ).toMatchObject({ status: 409, code: "CONFLICT" });
  });
});
