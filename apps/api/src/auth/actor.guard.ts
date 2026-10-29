import {
  CanActivate,
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "./actor-context.js";

/**
 * Requires a request-scoped ACTOR_CONTEXT resolved from the server session.
 * Missing/invalid session → 401 UNAUTHENTICATED (via exception filter).
 */
@Injectable({ scope: Scope.REQUEST })
export class ActorGuard implements CanActivate {
  constructor(
    @Inject(ACTOR_CONTEXT) private readonly actor: ActorContext | null,
  ) {}

  canActivate(): boolean {
    if (!this.actor?.organizationId || !this.actor.userId) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
