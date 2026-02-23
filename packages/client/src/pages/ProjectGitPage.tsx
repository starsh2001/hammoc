/**
 * ProjectGitPage - Git integration view (placeholder)
 */

import { GitBranch } from 'lucide-react';

export function ProjectGitPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-2xl mb-4">
        <GitBranch className="w-10 h-10 text-purple-600 dark:text-purple-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Git
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
        Git 저장소 상태 확인, 스테이징, 커밋, 푸시 등을 수행할 수 있습니다.
        <br />
        곧 출시됩니다.
      </p>
    </div>
  );
}
