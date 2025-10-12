export interface UserInfo {
  id_token?: string; 
  access_token?: string; 
  refresh_token?: string; 
  userinfo: {
    email?: string;
    preferred_username?: string;
    name?: string;
    roles: string[]; 
  };
}
