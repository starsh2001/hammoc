/**
 * Story 28.2: Client API wrapper for the harness skill endpoints.
 *
 * Thin pass-through over the shared `api` fetch client. Errors propagate as
 * `ApiError` instances so the store / component can branch on `err.code`.
 */

import type {
  HarnessReadResponse,
  HarnessSkillCopyRequest,
  HarnessSkillCopyResponse,
  HarnessSkillListResponse,
  HarnessSkillReadResponse,
  HarnessSkillSourceScope,
  HarnessSkillUpdateRequest,
  HarnessSkillUpdateResponse,
  HarnessWriteRequest,
  HarnessWriteResponse,
} from '@hammoc/shared';
import { api } from './client';

interface ReadParams {
  scope: HarnessSkillSourceScope;
  projectSlug?: string;
  pluginKey?: string;
}

interface UpdateParams {
  scope: 'project' | 'user';
  projectSlug?: string;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const enc = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
  return `?${enc.join('&')}`;
}

export async function listSkills(projectSlug?: string): Promise<HarnessSkillListResponse> {
  return api.get<HarnessSkillListResponse>(`/harness/skills${qs({ projectSlug })}`);
}

export async function readSkill(
  name: string,
  params: ReadParams,
): Promise<HarnessSkillReadResponse> {
  return api.get<HarnessSkillReadResponse>(
    `/harness/skills/${encodeURIComponent(name)}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
      pluginKey: params.pluginKey,
    })}`,
  );
}

export async function updateSkill(
  name: string,
  params: UpdateParams,
  body: HarnessSkillUpdateRequest,
): Promise<HarnessSkillUpdateResponse> {
  return api.put<HarnessSkillUpdateResponse>(
    `/harness/skills/${encodeURIComponent(name)}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
    })}`,
    body,
  );
}

export async function copySkill(
  body: HarnessSkillCopyRequest,
): Promise<HarnessSkillCopyResponse> {
  return api.post<HarnessSkillCopyResponse>('/harness/skills/copy', body);
}

export async function readBundleFile(
  name: string,
  resourcePath: string,
  params: ReadParams,
): Promise<HarnessReadResponse> {
  const segments = resourcePath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return api.get<HarnessReadResponse>(
    `/harness/skills/${encodeURIComponent(name)}/bundle/${segments}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
      pluginKey: params.pluginKey,
    })}`,
  );
}

export async function writeBundleFile(
  name: string,
  resourcePath: string,
  params: UpdateParams,
  body: HarnessWriteRequest,
): Promise<HarnessWriteResponse> {
  const segments = resourcePath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return api.put<HarnessWriteResponse>(
    `/harness/skills/${encodeURIComponent(name)}/bundle/${segments}${qs({
      scope: params.scope,
      projectSlug: params.projectSlug,
    })}`,
    body,
  );
}
