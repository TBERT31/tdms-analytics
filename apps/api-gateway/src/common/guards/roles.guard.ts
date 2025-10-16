import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException(
        'Authentication required. User not found in session.',
      );
    }

    if (!user.userinfo || !Array.isArray(user.userinfo.roles)) {
      throw new ForbiddenException(
        'User session corrupted: Role data missing or invalid.',
      );
    }

    const userRoles: string[] = user.userinfo.roles;

    if (userRoles.length === 0 && requiredRoles.length > 0) {
      throw new ForbiddenException('Insufficient roles for this resource.');
    }

    const hasRole = requiredRoles.some((requiredRole) => {
      return userRoles.includes(requiredRole);
    });

    if (!hasRole) {
      throw new ForbiddenException('Insufficient roles for this resource.');
    }

    return true;
  }
}
