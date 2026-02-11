/**
 * ProjectQueuePage - Queue runner view (placeholder)
 */

import { ListOrdered } from 'lucide-react';

export function ProjectQueuePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-2xl mb-4">
        <ListOrdered className="w-10 h-10 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        큐 러너
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
        작업 큐를 등록하고 순차적으로 실행할 수 있습니다.
        <br />
        곧 출시됩니다.
      </p>
    </div>
  );
}
