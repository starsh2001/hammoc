/**
 * Story 30.3 (Task 4.2): Zod runtime validation of `manifest.json` inside the
 * harness export/import bundle. Lives on the server because zod is a
 * server-only dep — the shared package exposes only the TypeScript surface
 * (`packages/shared/src/types/harnessBundle.ts`).
 *
 * Two boundaries call this schema:
 *   - the bundle service when unpacking an import ZIP (AC5.c "malformed
 *     manifest" branch)
 *   - the controller when accepting an export request body (AC1, AC2, AC5)
 *
 * Both reuse the discriminator/value sets exported from `@hammoc/shared` so
 * the schema and types stay in lockstep.
 */

import { z } from 'zod';
import {
  BUNDLE_SECTIONS,
  HARNESS_BUNDLE_VERSION,
  type BundleItemDomain,
  type BundleSection,
  type SecretsPolicy,
  type BundleSourceShareScope,
  type ImportItemAction,
} from '@hammoc/shared';

const sectionSchema = z.enum(BUNDLE_SECTIONS as readonly [BundleSection, ...BundleSection[]]);

const secretsPolicySchema = z.enum(['excluded', 'placeholder', 'included-explicit'] as const) satisfies z.ZodType<SecretsPolicy>;

const itemDomainSchema = z.enum([
  'claude-md',
  'skill',
  'mcp',
  'hook',
  'command',
  'agent',
  'bmad',
] as const) satisfies z.ZodType<BundleItemDomain>;

const sourceShareScopeSchema = z.enum(['shared', 'local', 'fullyIgnored'] as const) satisfies z.ZodType<BundleSourceShareScope>;

const itemActionSchema = z.enum(['overwrite', 'skip', 'rename', 'appendSection'] as const) satisfies z.ZodType<ImportItemAction>;

const pluginRefSchema = z.object({
  name: z.string().min(1),
  marketplace: z.string().min(1),
  version: z.string().optional(),
});

const bundleItemSchema = z.object({
  domain: itemDomainSchema,
  identity: z.string().min(1),
  relativePath: z.string().min(1),
  sourceShareScope: sourceShareScopeSchema,
});

/**
 * Strict manifest schema — `bundleVersion` is locked to the literal 1 so
 * future-version bundles fall through to the AC5.a "futureBundle" branch
 * before this schema is even consulted (the import service inspects the raw
 * JSON's version field first, then runs full Zod validation).
 */
export const bundleManifestSchema = z.object({
  bundleVersion: z.literal(HARNESS_BUNDLE_VERSION),
  hammocVersion: z.string().min(1),
  claudeCodeSpecVersion: z.union([z.string().min(1), z.null()]),
  createdAt: z.string().min(1),
  sourceProjectSlug: z.string().min(1),
  includes: z.array(sectionSchema),
  secretsPolicy: secretsPolicySchema,
  pluginDependencies: z.array(pluginRefSchema),
  items: z.array(bundleItemSchema),
});

export type BundleManifestParsed = z.infer<typeof bundleManifestSchema>;

/**
 * Loose schema used for "is this even a manifest?" detection before the
 * strict schema runs. Lets the import service distinguish "totally garbage
 * JSON" (no bundleVersion field at all) from "future bundle" (bundleVersion
 * is a number outside our supported range).
 */
export const loosenedManifestSchema = z.object({
  bundleVersion: z.number().int().optional(),
});

export const exportBundleRequestSchema = z.object({
  projectSlug: z.string().min(1),
  includes: z.array(sectionSchema).min(1, 'at least one section is required'),
  secretsPolicy: secretsPolicySchema,
});

export const importApplyRequestSchema = z.object({
  bundleToken: z.string().min(1),
  itemActions: z.record(z.string(), itemActionSchema),
});

export const pluginDepsQuerySchema = z.object({
  projectSlug: z.string().min(1),
});
