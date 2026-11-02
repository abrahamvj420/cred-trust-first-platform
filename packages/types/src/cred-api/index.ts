import { memberEndpoints } from './member';
import { productEndpoints } from './products';
import { signupEndpoints } from './signup';
import { adminEndpoints, platformEndpoints, privacyEndpoints } from './platform';

export * from './member';
export * from './products';
export * from './platform';
export * from './signup';

/** Every cred-api endpoint. cred-api registers routes only from this map. */
export const credApi = {
  member: memberEndpoints,
  signup: signupEndpoints,
  products: productEndpoints,
  privacy: privacyEndpoints,
  admin: adminEndpoints,
  platform: platformEndpoints,
} as const;
