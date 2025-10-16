import { Request } from 'express';
import { IOidcPassportUser } from './oidc-passport-user';

export interface AuthenticatedRequest extends Request {
  user?: IOidcPassportUser;
}
