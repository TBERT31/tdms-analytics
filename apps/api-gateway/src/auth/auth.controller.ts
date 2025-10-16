import {
  Controller,
  Get,
  HttpStatus,
  OnModuleInit,
  Request,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../common/auth/interfaces/authenticated-request';
import type { Response } from 'express';
import { LoginGuard } from '../common/guards/login.guard';
import { PreventAuthenticatedAccessGuard } from '../common/guards/prevent-authenticated-access.guard';
import { AuthService } from './auth.service';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiLoginOperation,
  ApiSignupOperation,
  ApiLogoutOperation,
  ApiCallbackOperation,
} from '../common/decorators/auth-swagger.decorators';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('auth')
@ApiTags('Auth')
export class AuthController implements OnModuleInit {
  private oidcPostLogoutRedirectUri!: string;
  private sessionCookieDomain!: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.oidcPostLogoutRedirectUri = this.configService.get<string>(
      'OAUTH2_CLIENT_REGISTRATION_LOGIN_POST_LOGOUT_REDIRECT_URI',
    )!;
    this.sessionCookieDomain = this.configService.get<string>(
      'SESSION_COOKIE_DOMAIN',
      'localhost',
    );
  }

  @Get('/login')
  @UseGuards(PreventAuthenticatedAccessGuard, LoginGuard)
  @ApiLoginOperation()
  login(@Request() req, @Res() res: Response) {
    try {
      const authorizationUrl = this.authService.getLoginAuthorizationUrl();
      res.redirect(authorizationUrl);
    } catch (error) {
      console.error('Error initiating Keycloak login redirection:', error);
      res.redirect('/error?message=Could not initiate login');
    }
  }

  @Get('/callback')
  @UseGuards(LoginGuard)
  @ApiCallbackOperation()
  loginCallback(@Request() req: AuthenticatedRequest, @Res() res: Response) {
    res.redirect(this.oidcPostLogoutRedirectUri);
  }

  @Get('/signup')
  @UseGuards(PreventAuthenticatedAccessGuard)
  @ApiSignupOperation()
  signup(@Request() req, @Res() res: Response) {
    try {
      const authorizationUrl = this.authService.getSignupAuthorizationUrl();
      res.redirect(authorizationUrl);
    } catch (error) {
      console.error('Error during Keycloak signup redirection:', error);
      res.redirect('/error?message=Could not initiate signup');
    }
  }

  @Get('/logout')
  @ApiLogoutOperation()
  logout(@Request() req: AuthenticatedRequest, @Res() res: Response) {
    const id_token: string | undefined = req.user?.id_token;

    req.logout((err?: Error) => {
      if (err) {
        console.error('Error during Passport logout:', err);
      }

      req.session.destroy((sessionError: any) => {
        if (sessionError) {
          console.error('Error destroying session:', sessionError);
          return res
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .send('Error destroying session.');
        }

        res.clearCookie('connect.sid', {
          path: '/',
          domain: this.sessionCookieDomain,
        });

        try {
          const logoutRedirectUrl =
            this.authService.getLogoutRedirectUrl(id_token);
          res.redirect(logoutRedirectUrl);
        } catch (error) {
          console.error('Error generating Keycloak logout URL:', error);
          res.redirect(this.oidcPostLogoutRedirectUri);
        }
      });
    });
  }

  @Get('/check-session')
  checkSession(@Request() req: AuthenticatedRequest, @Res() res: Response) {
    const authStatus = this.authService.checkAuthenticationStatus(req);

    const cleanAuthStatus = {
      isAuthenticated: authStatus.isAuthenticated,
      user: authStatus.isAuthenticated
        ? {
            userinfo: {
              email: authStatus.user?.userinfo?.email,
              preferred_username: authStatus.user?.userinfo?.preferred_username,
              name: authStatus.user?.userinfo?.name,
              given_name: authStatus.user?.userinfo?.given_name,
              family_name: authStatus.user?.userinfo?.family_name,
              email_verified: authStatus.user?.userinfo?.email_verified,
              sub: authStatus.user?.userinfo?.sub,
              roles: authStatus.user?.userinfo?.roles || [],
            },
          }
        : null,
    };

    if (cleanAuthStatus.isAuthenticated) {
      return res.status(HttpStatus.OK).json(cleanAuthStatus);
    } else {
      return res.status(HttpStatus.UNAUTHORIZED).json(cleanAuthStatus);
    }
  }
}
