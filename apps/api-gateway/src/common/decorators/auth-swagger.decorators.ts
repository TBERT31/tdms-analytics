import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

export function ApiAuthRedirectResponses(actionType: 'login' | 'signup') {
  const actionLabel = actionType === 'login' ? 'login' : 'signup/registration';
  const errorMessage =
    actionType === 'login'
      ? 'Could not initiate login'
      : 'Could not initiate signup';

  return applyDecorators(
    ApiResponse({
      status: 302,
      description: `Redirects to Keycloak ${actionLabel} page`,
      headers: {
        Location: {
          description: `Keycloak ${actionType} URL`,
          schema: {
            type: 'string',
            example:
              'https://keycloak.example.com/auth/realms/your-realm/protocol/openid-connect/auth?...',
          },
        },
      },
    }),
    ApiResponse({
      status: 302,
      description: `Redirect to error page if ${actionType} initiation fails`,
      headers: {
        Location: {
          description: 'Redirect URL',
          schema: {
            type: 'string',
            example: `/error?message=${errorMessage}`,
          },
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden - User is already authenticated',
    }),
  );
}

export function ApiLoginOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Initiate login process',
      description:
        'Redirects to the authentication provider (Keycloak) for user login. This endpoint is only accessible to non-authenticated users.',
    }),
    ApiAuthRedirectResponses('login'),
  );
}

export function ApiSignupOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Initiate signup process',
      description:
        'Redirects to the authentication provider (Keycloak) for user registration. This endpoint is only accessible to non-authenticated users.',
    }),
    ApiAuthRedirectResponses('signup'),
  );
}

export function ApiLogoutOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Logout user',
      description:
        'Logs out the current user by destroying the session, clearing cookies, and redirecting to the authentication provider logout endpoint.',
    }),
    ApiResponse({
      status: 302,
      description:
        'Redirects to Keycloak logout page or configured post-logout URI',
      headers: {
        Location: {
          description: 'Logout redirect URL',
          schema: { type: 'string' },
        },
      },
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal Server Error - Error destroying session',
    }),
  );
}

export function ApiCallbackOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'OAuth callback endpoint',
      description:
        'Handles the OAuth callback from the authentication provider after successful login. This endpoint processes the authorization code and establishes the user session.',
    }),
    ApiResponse({
      status: 302,
      description: 'Redirects to the configured post-login redirect URI',
      headers: {
        Location: {
          description: 'Post-login redirect URL',
          schema: { type: 'string' },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description:
        'Bad Request - Invalid authorization code or OAuth parameters',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication failed',
    }),
  );
}