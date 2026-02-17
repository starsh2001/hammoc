/**
 * AboutSection - App info, server health, and contact links for SettingsPage
 * [Source: Story 10.5 - Task 2]
 */

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../../services/api/client';

const GITHUB_ISSUES_URL = 'https://github.com/bmad-artifacts/bmad-studio/issues';

interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export function AboutSection() {
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

  return (
    <div className="space-y-6">
      {/* App info */}
      <div className="text-center py-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">BMad Studio</h3>
        {health && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">v{health.version}</p>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Made by BMad</p>
      </div>

      {/* Contact link */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">문제 신고 및 기능 제안</h3>
        <a
          href={GITHUB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub Issues 페이지로 이동 (새 탭)"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          GitHub Issues
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>

      {/* Server status */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">서버 상태</h3>

        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">확인 중...</p>
        )}

        {error && !loading && (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">서버 연결 실패</p>
            <button
              onClick={fetchHealth}
              aria-label="서버 상태 재확인"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                         text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700
                         border border-gray-300 dark:border-gray-600 rounded-lg
                         hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              재시도
            </button>
          </div>
        )}

        {health && !loading && !error && (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">상태</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    health.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  aria-label={health.status === 'healthy' ? '정상' : '비정상'}
                />
                {health.status}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">버전</span>
              <span className="text-sm text-gray-900 dark:text-white">{health.version}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">서버 시간</span>
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
