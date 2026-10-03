import {
  contractVersion,
  featureNames,
  setupSchema,
  type RuntimeSetup,
} from '../../shared/runtime/contracts.js';
/** Never infer service/human binding or provider qualification from an URL/key. */
export function runtimeSetup(): RuntimeSetup {
  const unavailable = {
    state: 'unsupported' as const,
    reason:
      'The producer service-to-human binding and this feature adapter are not qualified.',
  };
  return setupSchema.parse({
    version: contractVersion,
    runtimeOwner: 'ryoko',
    scope: null,
    controlPlane: {
      state: 'unconfigured',
      reason: 'A qualified server-owned Ryoko transport is required.',
    },
    binding: {
      state: 'unsupported',
      reason:
        'Authenticated Dots-to-Ryoko owner/session binding has not been qualified.',
    },
    compatibility: {
      state: 'degraded',
      reason:
        'Read-only producer schema is pinned; live service compatibility is not qualified.',
    },
    features: Object.fromEntries(
      featureNames.map((name) => [name, unavailable]),
    ),
    qualified: false,
  });
}
