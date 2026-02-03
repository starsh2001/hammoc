import { useState, useCallback, useRef } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ShowToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

interface UseToastResult {
  toasts: ToastMessage[];
  showToast: (options: ShowToastOptions) => void;
  removeToast: (id: string) => void;
}

/**
 * 토스트 알림을 관리하는 커스텀 훅
 *
 * 사용 예시:
 * const { toasts, showToast } = useToast();
 * showToast({ message: '복사되었습니다', type: 'success' });
 */
export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info', duration = 3000 }: ShowToastOptions) => {
      const id = `toast-${++toastIdRef.current}`;
      const newToast: ToastMessage = { id, message, type };

      setToasts((prev) => [...prev, newToast]);

      // 자동 제거
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  return { toasts, showToast, removeToast };
}
