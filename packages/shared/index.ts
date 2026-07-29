export * from "./types";
export * from "./lib/constants";
export { classifySsoProvider, validateSsoEmail } from "./lib/sso-domain";
export { renderInvitationEmail, type RenderInvitationParams } from "./lib/onboarding-email-template";
export { sendWithRetry, type SendWithRetryResult } from "./lib/email-retry";
export { sendInvitationEmail } from "./lib/email";
export { parsePaginationParams, paginationToSkipTake, buildPaginationResponse } from "./lib/pagination";
export { requireProdEnv, requireEnv } from "./lib/env";
export {
  MODULE_REGISTRY,
  ancestorsOf,
  isModuleEnabled,
  getAppConfig,
  globallyDisabledModules,
  computeDisabledModules,
  visibleModules,
  findModuleByPath,
  type ModuleDef,
  type AppModuleConfig,
} from "./lib/moduleRegistry";
export {
  INTERNAL_SERVICE_ALLOWLIST,
  isAllowedInternalService,
  type InternalService,
} from "./lib/internal-services";

// DO NOT re-export from "./lib/rateLimit" here.
// Rate-limit code pulls in ioredis (a Node-only package that tries to
// require the `dns` / `net` / `tls` built-ins). If a client component
// imports ANYTHING from "@quikit/shared", webpack walks the barrel and
// pulls ioredis into the client bundle, breaking the build with
// "Module not found: Can't resolve 'dns'".
//
// Consumers that need rate limiting import it explicitly from the
// subpath, which is server-only by convention:
//     import { rateLimitAsync } from "@quikit/shared/rateLimit";
//
// If you're adding a new symbol here, make sure it (and its transitive
// imports) contains no Node-only dependencies.
