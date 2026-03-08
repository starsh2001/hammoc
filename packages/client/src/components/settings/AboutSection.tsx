/**
 * AboutSection - App info, server health, and contact links for SettingsPage
 * [Source: Story 10.5 - Task 2]
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../../services/api/client';

interface PackageAuthor {
  name?: string;
  url?: string;
}

interface PackageRepository {
  type?: string;
  url?: string;
}

interface HealthResponse {
  status: string;
  version: string;
  description: string;
  license: string;
  author: PackageAuthor;
  repository: PackageRepository;
  homepage: string;
  timestamp: string;
}

function getGithubIssuesUrl(repository: PackageRepository): string | null {
  const url = repository.url;
  if (!url) return null;
  // Convert git URL to GitHub issues URL
  const match = url.match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (!match) return null;
  return `https://github.com/${match[1]}/issues`;
}

export function AboutSection() {
  const { t } = useTranslation('settings');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.get<HealthResponse>('/health');
      setHealth(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const issuesUrl = health ? getGithubIssuesUrl(health.repository) : null;
  const authorUrl = health?.author?.url;

  return (
    <div className="space-y-6">
      {/* App info */}
      <div className="text-center py-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">BMad Studio</h3>
        {health && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">v{health.version}</p>
            {health.description && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{health.description}</p>
            )}
            {health.author?.name && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Made by{' '}
                {authorUrl ? (
                  <a
                    href={authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {health.author.name}
                  </a>
                ) : (
                  health.author.name
                )}
              </p>
            )}
            {health.license && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{health.license} License</p>
            )}
          </>
        )}
      </div>

      {/* Contact link */}
      {issuesUrl && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('about.issuesAndSuggestions')}</h3>
          <a
            href={issuesUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('about.githubIssuesAriaLabel')}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            GitHub Issues
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      {/* Server status */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('about.serverStatus')}</h3>

        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('about.checking')}</p>
        )}

        {error && !loading && (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">{t('about.connectionFailed')}</p>
            <button
              onClick={fetchHealth}
              aria-label={t('about.retryCheckAriaLabel')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                         text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700
                         border border-gray-300 dark:border-gray-600 rounded-lg
                         hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              {t('about.retry')}
            </button>
          </div>
        )}

        {health && !loading && !error && (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('about.status')}</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    health.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  aria-label={t(health.status === 'healthy' ? 'about.statusHealthy' : 'about.statusUnhealthy')}
                />
                {health.status}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('about.version')}</span>
              <span className="text-sm text-gray-900 dark:text-white">{health.version}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('about.serverTime')}</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {new Date(health.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
