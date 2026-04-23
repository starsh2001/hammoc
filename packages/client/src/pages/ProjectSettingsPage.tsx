/**
 * ProjectSettingsPage - Project-scoped settings tab
 * Binds projectSlug from the route so the section edits the current project directly.
 */

import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProjectSettingsSection } from '../components/settings/ProjectSettingsSection';

export function ProjectSettingsPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { t } = useTranslation('settings');

  if (!projectSlug) return null;

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        {t('tabs.project')}
      </h2>
      <ProjectSettingsSection projectSlug={projectSlug} />
    </div>
  );
}
