export interface JwtPayload {
    exp: number;
    iat: number;
    jti: string;
    iss: string;
    aud: string;
    sub: string;
    typ: string;
    azp: string;
    sid: string;
    acr: string;
    scope: string;
    email_verified: boolean;
    name: string;
    preferred_username: string;
    given_name: string;
    family_name: string;
    email: string;
  
    realm_access: {
      roles: string[];
    };
  
    resource_access?: {
      [client: string]: {
        roles: string[];
      };
    };
}
  