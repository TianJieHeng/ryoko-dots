import { z } from 'zod';
import { contractVersion, scopeSchema } from './contracts';

export const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const immutableId = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => value !== '.' && value !== '..',
    'Invalid artifact identity',
  );
export const artifactSchema = z
  .strictObject({
    id: immutableId,
    version: immutableId,
    filename: z
      .string()
      .min(1)
      .max(255)
      // eslint-disable-next-line no-control-regex -- Filenames must reject control bytes.
      .regex(/^[^/\\\u0000-\u001f\u007f]+$/),
    mime: z
      .string()
      .min(3)
      .max(255)
      .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/),
    size: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    authority: z.enum(['dots-native', 'runtime-registered']),
    status: z.enum(['committed', 'validating', 'unavailable']),
    authorized: z.boolean(),
  })
  .readonly();
export type RuntimeArtifact = z.infer<typeof artifactSchema>;
export const artifactsSchema = z.strictObject({
  version: z.literal(contractVersion),
  scope: scopeSchema,
  artifacts: z.array(artifactSchema).max(100),
  truncated: z.boolean(),
});
export type RuntimeArtifacts = z.infer<typeof artifactsSchema>;
