import { IOidcPassportUser } from "./oidc-passport-user";

export interface AuthenticatedRequest extends Request {
  user?: IOidcPassportUser;
  logout: (callback: (err?: Error) => void) => void;
  session: {
    destroy: (callback: (err?: Error) => void) => void;
    [key: string]: unknown;
  };
  isAuthenticated: () => boolean;
}