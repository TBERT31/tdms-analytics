import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { IDecodedAccessToken } from '../auth/interfaces/decoded-access-token';
import { IOidcPassportUser } from '../auth/interfaces/oidc-passport-user';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import * as client from 'openid-client';
import {
  type Configuration,
  DiscoveryRequestOptions,
  TokenEndpointResponse,
  TokenEndpointResponseHelpers,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
} from 'openid-client';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { AuthService } from '../../auth/auth.service';

interface RolesMapping {
  [key: string]: string[];
}

interface ClientWithInsecureRequests {
  allowInsecureRequests: (config: Configuration) => void;
}

interface ClientData {
  roles?: string[];
}

interface ResourceAccess {
  [clientName: string]: ClientData;
}

const configureInsecureRequests = (config: Configuration): void => {
  const methodName = 'allowInsecureRequests';
  const clientWithMethod = client as unknown as ClientWithInsecureRequests;
  clientWithMethod[methodName](config);
};

const getInsecureRequestsFunction = (): ((config: Configuration) => void) => {
  const methodName = 'allowInsecureRequests';
  const clientWithMethod = client as unknown as ClientWithInsecureRequests;
  return clientWithMethod[methodName];
};

export const buildOpenIdClient = async (): Promise<Configuration> => {
  try {
    const clientId = process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_CLIENT_ID!;
    const clientSecret =
      process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_CLIENT_SECRET!;
    const issuerUrl = process.env.OAUTH2_CLIENT_PROVIDER_OIDC_ISSUER!;

    const shouldAllowHttpRequests =
      process.env.NODE_ENV === 'development' && issuerUrl.startsWith('http://');

    const discoveryOptions: DiscoveryRequestOptions = shouldAllowHttpRequests
      ? {
          execute: [getInsecureRequestsFunction()],
        }
      : {};

    const issuerConfig = await discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret,
      undefined,
      discoveryOptions,
    );

    if (shouldAllowHttpRequests) {
      configureInsecureRequests(issuerConfig);
    }

    return issuerConfig;
  } catch (error) {
    console.error('Failed to initialize OpenID Client:', error);
    throw new InternalServerErrorException(
      'Authentication service could not be initialized due to OIDC client configuration error.',
    );
  }
};

export class OidcStrategy extends PassportStrategy(OAuth2Strategy, 'oidc') {
  issuerConfig: Configuration;

  constructor(
    private readonly authService: AuthService,
    issuerConfig: Configuration,
  ) {
    super({
      clientID: issuerConfig.clientMetadata().client_id,
      clientSecret: issuerConfig.clientMetadata().client_secret as string,
      callbackURL: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_REDIRECT_URI!,
      scope: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_SCOPE,
      authorizationURL: issuerConfig.serverMetadata()
        .authorization_endpoint as string,
      tokenURL: issuerConfig.serverMetadata().token_endpoint as string,
      passReqToCallback: true,
    });

    this.issuerConfig = issuerConfig;
  }

  authenticate(req: Request, options?: unknown): void {
    if (this.isUserAlreadyLoggedIn(req)) {
      return;
    }

    if (req.query?.code) {
      this.handleAuthorizationCodeGrant(req);
    } else {
      this.redirectToAuthorizationUrl();
    }
  }

  private isUserAlreadyLoggedIn(req: Request): boolean {
    const isLoggedIn = req.isAuthenticated?.() ?? false;
    if (isLoggedIn) {
      const redirectUrl =
        process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_REDIRECT_URI!;
      this.redirect(redirectUrl);
      return true;
    }
    return false;
  }

  private handleAuthorizationCodeGrant(req: Request): void {
    const currentUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    authorizationCodeGrant(this.issuerConfig, new URL(currentUrl))
      .then((tokens) => {
        const user = this.validate(tokens);
        this.success(user);
      })
      .catch((error) => {
        console.error('OIDC authentication error:', error);
        this.fail('Authentication failed');
      });
  }

  private redirectToAuthorizationUrl(): void {
    const authUrl: URL = buildAuthorizationUrl(this.issuerConfig, {
      scope: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_SCOPE!,
      redirect_uri: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_REDIRECT_URI!,
    });
    this.redirect(authUrl.toString());
  }

  validate(
    tokens: TokenEndpointResponse & TokenEndpointResponseHelpers,
  ): IOidcPassportUser {
    try {
      const { id_token, access_token, refresh_token } = tokens;

      if (!access_token) {
        throw new UnauthorizedException('Failed to validate OIDC tokens.');
      }

      const decodedAccessToken = jwt.decode(
        access_token,
      ) as IDecodedAccessToken;
      const roles = this.extractRoles(decodedAccessToken);

      return this.buildUserObject(
        { id_token, access_token, refresh_token },
        decodedAccessToken,
        roles,
      );
    } catch (err) {
      console.error('Error during OIDC validation:', err);
      throw new UnauthorizedException('Failed to validate OIDC tokens.');
    }
  }

  private extractRoles(decodedAccessToken: IDecodedAccessToken): string[] {
    const rawRoles = this.extractRawRoles(decodedAccessToken);
    return [...new Set(rawRoles)];
  }

  private extractRawRoles(decodedAccessToken: IDecodedAccessToken): string[] {
    const rawRoles: string[] = [];

    if (this.hasRealmRoles(decodedAccessToken)) {
      rawRoles.push(...decodedAccessToken.realm_access!.roles);
    }

    if (decodedAccessToken?.resource_access) {
      this.extractResourceRoles(
        decodedAccessToken.resource_access as ResourceAccess,
        rawRoles,
      );
    }

    return rawRoles;
  }

  private hasRealmRoles(decodedAccessToken: IDecodedAccessToken): boolean {
    return !!(
      decodedAccessToken?.realm_access?.roles &&
      Array.isArray(decodedAccessToken.realm_access.roles)
    );
  }

  private extractResourceRoles(
    resourceAccess: ResourceAccess,
    rawRoles: string[],
  ): void {
    for (const clientName in resourceAccess) {
      if (Object.hasOwn(resourceAccess, clientName)) {
        const clientData = resourceAccess[clientName];
        if (this.hasValidRoles(clientData)) {
          rawRoles.push(...(clientData.roles as string[]));
        }
      }
    }
  }

  private hasValidRoles(clientData: ClientData): boolean {
    return !!(clientData?.roles && Array.isArray(clientData.roles));
  }

  private buildUserObject(
    tokens: { id_token?: string; access_token: string; refresh_token?: string },
    decodedAccessToken: IDecodedAccessToken,
    roles: string[],
  ): IOidcPassportUser {
    return {
      id_token: tokens.id_token,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      userinfo: {
        email: decodedAccessToken.email,
        preferred_username: decodedAccessToken.preferred_username,
        name: decodedAccessToken.name,
        given_name: decodedAccessToken.given_name,
        family_name: decodedAccessToken.family_name,
        email_verified: decodedAccessToken.email_verified,
        sub: decodedAccessToken.sub,
        roles,
      },
    };
  }
}
