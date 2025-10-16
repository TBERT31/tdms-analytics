import { SetMetadata } from '@nestjs/common';

export const AUTHORIZATIONS_KEY = 'authorizations';

export const Authorizations = (options: { authorizations: string[] }) => {
  return SetMetadata(AUTHORIZATIONS_KEY, options.authorizations);
};
