import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

/**
 * Same UUID shape as body parsers (version nibble 1–8).
 * A bad path id is 404, not 400 and not a database error: missing and
 * malformed identifiers stay indistinguishable.
 */
const UUID_PARAM_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidParam(value: unknown): boolean {
  return typeof value === "string" && UUID_PARAM_RE.test(value);
}

@Injectable()
export class UuidParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, unknown>;
    }>();
    for (const value of Object.values(request.params ?? {})) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (!isUuidParam(item)) {
          throw new NotFoundException();
        }
      }
    }
    return true;
  }
}
