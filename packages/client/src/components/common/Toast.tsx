import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToastMessage } from '../../hooks/useToast';

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  const { t } = useTranslation('common');
  const icons = {
    success: (
      <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
    ),
    error: <XCircle className="w-5 h-5 text-red-500" aria-hidden="true" />,
    info: <Info className="w-5 h-5 text-blue-500" aria-hidden="true" />,
  };

  const bgColors = {
    success:
      'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border shadow-lg animate-slideUp ${bgColors[toast.type]}`}
      role="alert"
      aria-live="polite"
    >
      {icons[toast.type]}
      <span className="flex-grow text-sm text-gray-800 dark:text-gray-200">
        {toast.message}
      </span>
      <button
        onClick={() => onClose(toast.id)}
        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] transition-colors"
        aria-label={t('toast.closeAria')}
      >
        <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

/**
 * 토스트 메시지 컨테이너
 * 화면 우측 하단에 고정 배치
 */
export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  const { t } = useTranslation('common');
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-label={t('toast.containerAria')}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}
