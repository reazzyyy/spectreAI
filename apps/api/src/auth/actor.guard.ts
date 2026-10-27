import {
  CanActivate,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ACTOR_CONTEXT, type ActorContext } from "./actor-context.js";

@Injectable()
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
