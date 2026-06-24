import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../../services/api/client';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

export function ApiKeyStep({ onNext, onSkip }: Props) {
  const { t } = useTranslation('auth');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatWarning, setFormatWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (value: string) => {
    setApiKey(value);
    setError(null);
    setFormatWarning(value.trim().length > 0 && !value.trim().startsWith('sk-ant-'));
  };

  const handleSubmit = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError(t('wizard.apiKey.errorEmpty'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.post('/config/api-key', { apiKey: trimmed });
      toast.success(t('wizard.apiKey.saved'));
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('wizard.apiKey.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('wizard.apiKey.title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('wizard.apiKey.description')}
        </p>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="password"
          value={apiKey}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="sk-ant-..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-[#455568]
                     bg-white dark:bg-[#1c2129] text-gray-900 dark:text-white font-mono text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     min-h-[44px]"
          aria-describedby={error ? 'api-key-error' : formatWarning ? 'api-key-warning' : undefined}
          aria-invalid={!!error}
        />

        {formatWarning && !error && (
          <div id="api-key-warning" className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{t('wizard.apiKey.formatWarning')}</span>
          </div>
        )}

        {error && (
          <p id="api-key-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !apiKey.trim()}
          className="w-full flex items-center justify-center py-3 rounded-lg text-sm font-medium
                     bg-blue-500 hover:bg-blue-600 text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {saving ? t('wizard.apiKey.saving') : t('wizard.next')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
                     transition-colors min-h-[44px]"
        >
          {t('wizard.apiKey.later')}
        </button>
      </div>
    </div>
  );
}
