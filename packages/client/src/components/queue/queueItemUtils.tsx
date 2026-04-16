/**
 * Shared utilities for queue item rendering — used by QueueRunnerPanel and QueueLockedBanner.
 */

import {
  CheckCircle,
  PauseCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { QueueItem } from '@hammoc/shared';

export type ItemStatus = 'error' | 'running' | 'paused' | 'completed' | 'pending';

export function getItemSummary(item: QueueItem, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (item.loop) {
    let summary = `@loop max=${item.loop.max}`;
    if (item.loop.until) summary += ` until="${item.loop.until}"`;
    return summary;
  }
  if (item.isBreakpoint) return `${t('queue.itemSummary.pause')}${item.prompt ? `: ${item.prompt}` : ''}`;
  if (item.isNewSession && item.prompt) return `${t('queue.itemSummary.newSession')} ${item.prompt.slice(0, 80)}`;
  if (item.isNewSession) return t('queue.itemSummary.newSessionStart');
  if (item.saveSessionName) return `${t('queue.itemSummary.saveSession')} ${item.saveSessionName}`;
  if (item.loadSessionName) return `${t('queue.itemSummary.loadSession')} ${item.loadSessionName}`;
  if (item.modelName && item.prompt) return `${t('queue.itemSummary.modelPrefix')} ${item.modelName}] ${item.prompt.slice(0, 60)}`;
  if (item.modelName) return `${t('queue.itemSummary.modelChange')} ${item.modelName}`;
  if (item.pauseword != null) return `${t('queue.itemSummary.pauseword')} "${item.pauseword}"`;
  if (item.delayMs) return `${t('queue.itemSummary.wait')} ${item.delayMs}ms`;
  return item.prompt.slice(0, 80) + (item.prompt.length > 80 ? '...' : '');
}

export function getItemStatus(
  index: number,
  currentIndex: number,
  isRunning: boolean,
  isPaused: boolean,
  completedItems: Set<number>,
  errorItem: { index: number; error: string } | null,
): ItemStatus {
  if (errorItem?.index === index) return 'error';
  if (index === currentIndex && isRunning && !isPaused) return 'running';
  if (index === currentIndex && isPaused) return 'paused';
  if (completedItems.has(index) || index < currentIndex) return 'completed';
  return 'pending';
}

export function ItemStatusIcon({ status, size = 'md' }: { status: ItemStatus; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-3 h-3 flex-shrink-0' : 'w-4 h-4 flex-shrink-0';
  switch (status) {
    case 'error':
      return <XCircle className={`${cls} text-red-500`} />;
    case 'running':
      return <Loader2 className={`${cls} text-blue-500 animate-spin`} />;
    case 'paused':
      return <PauseCircle className={`${cls} text-amber-500`} />;
    case 'completed':
      return <CheckCircle className={`${cls} text-green-500`} />;
    case 'pending':
      return <Clock className={`${cls} text-gray-400`} />;
  }
}
