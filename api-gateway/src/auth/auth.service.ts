import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from '../common/auth/interfaces/authenticated-request';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  Configuration,
} from 'openid-client';
import { buildOpenIdClient } from '../common/strategies/oidc.strategy';
import { CustomLoggerService } from '../common/logger/logger.service';

@Injectable()
export class AuthService {
  private oidcScope!: string;
  private oidcRedirectUri!: string;
  private oidcPostLogoutRedirectUri!: string;
  private issuerConfig?: Configuration;
  private signupIssuerConfig?: Configuration;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: CustomLoggerService,
  ) {}

  async onModuleInit() {
    this.oidcScope = this.configService.get<string>(
      'OAUTH2_CLIENT_REGISTRATION_LOGIN_SCOPE',
    )!;
    this.oidcRedirectUri = this.configService.get<string>(
      'OAUTH2_CLIENT_REGISTRATION_LOGIN_REDIRECT_URI',
    )!;
    this.oidcPostLogoutRedirectUri = this.configService.get<string>(
      'OAUTH2_CLIENT_REGISTRATION_LOGIN_POST_LOGOUT_REDIRECT_URI',
    )!;

    try {
      this.logger.info('Building OpenID clients', {}, 'AuthService');

      const issuer = await buildOpenIdClient();
      this.setIssuerConfig(issuer);

      this.logger.info(
        'OpenID Main Client successfully initialized',
        {},
        'AuthService',
      );

      this.setSignupIssuerConfig(issuer);

      this.logger.info(
        'OpenID Registration client successfully initialized',
        {},
        'AuthService',
      );

      this.logger.info(
        'AuthService initialization completed',
        {},
        'AuthService',
      );
    } catch (err) {
      this.logger.error(
        'Error when building the OIDC client',
        err as Error,
        {},
        'AuthService',
      );
      throw err;
    }
  }

  setIssuerConfig(issuerConfig: Configuration) {
    this.issuerConfig = issuerConfig;
  }

  setSignupIssuerConfig(signupIssuerConfig: Configuration) {
    this.signupIssuerConfig = signupIssuerConfig;
  }

  getLoginAuthorizationUrl(): string {
    if (!this.issuerConfig) {
      this.logger.error(
        'OpenID Client not initialized when requesting login URL',
        new Error('OpenID Client not initialized'),
        {},
        'AuthService',
      );
      throw new InternalServerErrorException(
        'OpenID Client not initialized. Please ensure the application starts correctly.',
      );
    }

    try {
      const clientId = this.configService.get<string>(
        'OAUTH2_CLIENT_REGISTRATION_LOGIN_CLIENT_ID',
      )!;

      const authorizationUrl = buildAuthorizationUrl(this.issuerConfig, {
        client_id: clientId,
        scope: this.oidcScope,
        redirect_uri: this.oidcRedirectUri,
        response_type: 'code',
      });

      this.logger.info(
        'Login authorization URL generated successfully',
        {
          clientId,
          scope: this.oidcScope,
          redirectUri: this.oidcRedirectUri,
        },
        'AuthService',
      );

      return authorizationUrl.toString();
    } catch (error) {
      this.logger.error(
        'Failed to generate login authorization URL',
        error as Error,
        {},
        'AuthService',
      );
      throw error;
    }
  }

  getSignupAuthorizationUrl(): string {
    if (!this.signupIssuerConfig) {
      this.logger.error(
        'Signup OpenID Client not initialized when requesting signup URL',
        new Error('Signup OpenID Client not initialized'),
        {},
        'AuthService',
      );
      throw new InternalServerErrorException(
        'Signup OpenID Client not initialized.',
      );
    }

    try {
      const clientId = this.configService.get<string>(
        'OAUTH2_CLIENT_REGISTRATION_LOGIN_CLIENT_ID',
      )!;

      const authorizationUrl = buildAuthorizationUrl(this.signupIssuerConfig, {
        client_id: clientId,
        scope: this.oidcScope,
        redirect_uri: this.oidcPostLogoutRedirectUri,
        prompt: 'create',
        response_type: 'code',
      });

      this.logger.info(
        'Signup authorization URL generated successfully',
        {
          clientId,
          scope: this.oidcScope,
          redirectUri: this.oidcPostLogoutRedirectUri,
          prompt: 'create',
        },
        'AuthService',
      );

      return authorizationUrl.toString();
    } catch (error) {
      this.logger.error(
        'Failed to generate signup authorization URL',
        error as Error,
        {},
        'AuthService',
      );
      throw error;
    }
  }

  getLogoutRedirectUrl(idToken?: string): string {
    if (!this.issuerConfig) {
      this.logger.error(
        'OpenID Issuer not initialized when requesting logout URL',
        new Error('OpenID Issuer not initialized'),
        {},
        'AuthService',
      );
      throw new InternalServerErrorException(
        'OpenID Issuer not initialized. Please ensure the application starts correctly.',
      );
    }

    try {
      const endSessionEndpoint =
        this.issuerConfig.serverMetadata().end_session_endpoint;

      let logoutUrl: string;

      if (endSessionEndpoint) {
        logoutUrl =
          endSessionEndpoint +
          '?post_logout_redirect_uri=' +
          this.oidcPostLogoutRedirectUri +
          (idToken ? '&id_token_hint=' + idToken : '');

        this.logger.info(
          'Logout URL generated with end session endpoint',
          {
            endSessionEndpoint,
            postLogoutRedirectUri: this.oidcPostLogoutRedirectUri,
            hasIdTokenHint: !!idToken,
          },
          'AuthService',
        );
      } else {
        logoutUrl = this.oidcPostLogoutRedirectUri;

        this.logger.warn(
          'No end session endpoint available, using fallback redirect URI',
          { fallbackUri: this.oidcPostLogoutRedirectUri },
          'AuthService',
        );
      }

      return logoutUrl;
    } catch (error) {
      this.logger.error(
        'Failed to generate logout redirect URL',
        error as Error,
        { hasIdToken: !!idToken },
        'AuthService',
      );
      throw error;
    }
  }

  async handleAuthorizationCallback(currentUrl: URL, state?: string) {
    if (!this.issuerConfig) {
      this.logger.error(
        'OpenID Client not initialized during authorization callback',
        new Error('OpenID Client not initialized'),
        { currentUrl: currentUrl.toString() },
        'AuthService',
      );
      throw new InternalServerErrorException('OpenID Client not initialized.');
    }

    try {
      const tokens = await authorizationCodeGrant(
        this.issuerConfig,
        currentUrl,
        {},
        {
          redirect_uri: this.oidcRedirectUri,
          ...(state && { state }),
        },
      );

      this.logger.info(
        'Authorization callback processed successfully',
        {
          hasAccessToken: !!tokens.access_token,
          hasIdToken: !!tokens.id_token,
          hasRefreshToken: !!tokens.refresh_token,
          tokenType: tokens.token_type,
          expiresIn: tokens.expires_in,
        },
        'AuthService',
      );

      return tokens;
    } catch (error) {
      this.logger.error(
        'Authorization callback processing failed',
        error as Error,
        {
          currentUrl: currentUrl.toString(),
          hasState: !!state,
        },
        'AuthService',
      );
      throw new InternalServerErrorException(
        'Failed to process authorization callback',
      );
    }
  }

  checkAuthenticationStatus(req: AuthenticatedRequest) {
    if (req.isAuthenticated() && req.user) {
      return {
        isAuthenticated: true,
        user: { ...req.user },
      };
    } else {
      return { isAuthenticated: false, user: null };
    }
  }
}