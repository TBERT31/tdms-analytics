interface IRealmAccess {
  roles: string[];
}

interface IClientRoles {
  roles: string[];
}

interface IResourceAccess {
  [clientName: string]: IClientRoles;
}

export interface IDecodedAccessToken {
  realm_access?: IRealmAccess;
  resource_access?: IResourceAccess;
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
}