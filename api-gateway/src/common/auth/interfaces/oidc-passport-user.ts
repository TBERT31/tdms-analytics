export class IOidcUserinfo {
  sub!: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  roles!: string[];
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
  picture?: string;
}

export class IOidcPassportUser {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  userinfo!: IOidcUserinfo;
};