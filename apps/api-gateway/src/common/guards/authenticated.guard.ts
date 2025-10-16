import {
  ExecutionContext,
  Injectable,
  CanActivate,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.isAuthenticated()) {
      throw new UnauthorizedException(
        'Authentication required to access this resource.',
      );
    }

    return true;
  }
}
