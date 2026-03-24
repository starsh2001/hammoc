/**
 * WebPushSettingsSection - Browser push notification settings for SettingsPage
 * Manages Web Push subscription, enable/disable toggle, and test notifications
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bell, BellOff, Send, Loader2, Smartphone, RefreshCw } from 'lucide-react';
import { preferencesApi } from '../../services/api/preferences';
import type { WebPushSettingsApiResponse } from '@hammoc/shared';

/** Convert VAPID public key from base64url to Uint8Array for PushManager.subscribe */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window;

export function WebPushSettingsSection() {
  const [settings, setSettings] = useState<WebPushSettingsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Test state
  const [testing, setTesting] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const { t } = useTranslation('settings');

  // Check current subscription state
  const checkSubscription = useCallback(async () => {
    if (!isPushSupported) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  // Fetch server settings
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      preferencesApi.getWebPush(),
      checkSubscription(),
    ])
      .then(([data]) => {
        if (!cancelled) { setSettings(data); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [fetchKey, checkSubscription]);

  // Toggle server-side enabled
  const handleToggleEnabled = useCallback(async () => {
    if (!settings) return;
    try {
      setUpdating(true);
      const updated = await preferencesApi.updateWebPush({ enabled: !settings.enabled });
      setSettings(updated);
      toast.success(t(settings.enabled ? 'webPush.disabled' : 'webPush.enabled'));
    } catch {
      toast.error(t('toast.settingSaveFailed'));
    } finally {
      setUpdating(false);
    }
  }, [settings, t]);

  // Subscribe this browser
  const handleSubscribe = useCallback(async () => {
    if (!settings) return;
    try {
      setUpdating(true);

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error(t('webPush.permissionDenied'));
        setUpdating(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
      });

      const subJson = sub.toJSON();
      try {
        await preferencesApi.subscribeWebPush({
          subscription: {
            endpoint: subJson.endpoint!,
            keys: {
              p256dh: subJson.keys!.p256dh!,
              auth: subJson.keys!.auth!,
            },
          },
          userAgent: navigator.userAgent,
        });
      } catch {
        // Server registration failed — rollback browser subscription
        await sub.unsubscribe().catch(() => {});
        toast.error(t('webPush.subscribeError'));
        setUpdating(false);
        return;
      }

      // Auto-enable if not already
      if (!settings.enabled) {
        const updated = await preferencesApi.updateWebPush({ enabled: true });
        setSettings(updated);
      } else {
        // Refresh subscription count
        const refreshed = await preferencesApi.getWebPush();
        setSettings(refreshed);
      }

      setSubscribed(true);
      toast.success(t('webPush.subscribeSuccess'));
    } catch {
      toast.error(t('webPush.subscribeError'));
    } finally {
      setUpdating(false);
    }
  }, [settings, t]);

  // Unsubscribe this browser
  const handleUnsubscribe = useCallback(async () => {
    try {
      setUpdating(true);
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        // Remove from server first
        await preferencesApi.unsubscribeWebPush(sub.endpoint);
        // Then unsubscribe locally
        await sub.unsubscribe();
      }
      setSubscribed(false);
      // Refresh settings
      const refreshed = await preferencesApi.getWebPush();
      setSettings(refreshed);
      toast.success(t('webPush.unsubscribeSuccess'));
    } catch {
      toast.error(t('webPush.unsubscribeError'));
    } finally {
      setUpdating(false);
    }
  }, [t]);

  // Send test push
  const handleTest = useCallback(async () => {
    if (testing || cooldown) return;
    setTesting(true);
    try {
      const result = await preferencesApi.testWebPush();
      if (result.success) {
        toast.success(t('webPush.testSuccess'));
      } else {
        toast.error(t('webPush.testFailure', { error: result.error }));
      }
    } catch {
      toast.error(t('webPush.testFailure', { error: 'Server error' }));
    } finally {
      setTesting(false);
      setCooldown(true);
      setTimeout(() => setCooldown(false), 5000);
    }
  }, [testing, cooldown, t]);

  // Not supported
  if (!isPushSupported) {
    return (
      <div className="bg-gray-50 dark:bg-[#263240] rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <BellOff className="w-4 h-4" />
          <p className="text-sm">{t('webPush.notSupported')}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error
  if (error || !settings) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">
          {t('webPush.loadError')}
        </p>
        <button
          onClick={() => setFetchKey((k) => k + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-gray-100 dark:bg-[#253040] text-gray-700 dark:text-gray-200
                     hover:bg-gray-200 dark:hover:bg-[#2d3a4a] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('webPush.retry')}
        </button>
      </div>
    );
  }

  const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="bg-gray-50 dark:bg-[#263240] rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('webPush.description')}
        </p>
        {/* iOS hint */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('webPush.iosHint')}
        </p>
      </div>

      {/* Subscription Status */}
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${subscribed ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span className="text-sm text-gray-700 dark:text-gray-200">
          {subscribed ? t('webPush.subscribed') : t('webPush.notSubscribed')}
        </span>
        {settings.subscriptionCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            <Smartphone className="w-3 h-3 inline mr-1" />
            {t('webPush.subscribedDevices', { count: settings.subscriptionCount })}
          </span>
        )}
      </div>

      {/* Subscribe / Unsubscribe */}
      <div className="flex flex-wrap gap-3">
        {!subscribed ? (
          <button
            onClick={handleSubscribe}
            disabled={updating || notificationPermission === 'denied'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-blue-600 hover:bg-blue-700 text-white
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            {t('webPush.subscribe')}
          </button>
        ) : (
          <button
            onClick={handleUnsubscribe}
            disabled={updating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#455568]
                       hover:bg-gray-100 dark:hover:bg-[#253040]
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
            {t('webPush.unsubscribe')}
          </button>
        )}
      </div>

      {/* Permission denied warning */}
      {notificationPermission === 'denied' && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {t('webPush.permissionDenied')}
        </p>
      )}

      {/* Enable Toggle */}
      <div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="webpush-enabled"
            checked={settings.enabled}
            onChange={handleToggleEnabled}
            disabled={updating}
            className="w-4 h-4 rounded border-gray-300 dark:border-[#455568]
                       text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label
            htmlFor="webpush-enabled"
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            {t('webPush.enableNotifications')}
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-300 ml-7">
          {t('webPush.enableHint')}
        </p>
      </div>

      {/* Test Button */}
      <div>
        <button
          onClick={handleTest}
          disabled={!settings.enabled || !subscribed || testing || cooldown || updating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-blue-600 hover:bg-blue-700 text-white
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {testing ? t('webPush.testSending') : t('webPush.testSend')}
        </button>
      </div>
    </div>
  );
}
