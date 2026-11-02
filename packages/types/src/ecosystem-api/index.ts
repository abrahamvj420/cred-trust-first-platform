import { aaEndpoints, bankEndpoints, gatewayEndpoints, upiEndpoints } from './money-rails';
import {
  bureauEndpoints,
  ecosystemPlatformEndpoints,
  fundhouseEndpoints,
  insurerEndpoints,
  lenderEndpoints,
  simEndpoints,
  wearableEndpoints,
} from './providers';

export * from './money-rails';
export * from './providers';

/** Every ecosystem-api endpoint, by namespace. */
export const ecosystemApi = {
  bank: bankEndpoints,
  bureau: bureauEndpoints,
  gateway: gatewayEndpoints,
  upi: upiEndpoints,
  aa: aaEndpoints,
  lender: lenderEndpoints,
  insurer: insurerEndpoints,
  fundhouse: fundhouseEndpoints,
  wearable: wearableEndpoints,
  sim: simEndpoints,
  platform: ecosystemPlatformEndpoints,
} as const;
