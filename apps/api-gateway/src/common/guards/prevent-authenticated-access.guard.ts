import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request';
import { Response } from 'express';

@Injectable()
export class PreventAuthenticatedAccessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.isAuthenticated()) {
      response.redirect(
        this.configService.get<string>(
          'OAUTH2_CLIENT_REGISTRATION_LOGIN_POST_LOGOUT_REDIRECT_URI',
        )!,
      );
      return false;
    }

    return true;
  }
}
