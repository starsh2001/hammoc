/**
 * ProjectTerminalPage - Remote terminal view (placeholder)
 */

import { Terminal } from 'lucide-react';

export function ProjectTerminalPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-2xl mb-4">
        <Terminal className="w-10 h-10 text-green-600 dark:text-green-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        터미널
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
        웹 브라우저에서 서버 PC의 터미널을 원격으로 사용할 수 있습니다.
        <br />
        곧 출시됩니다.
      </p>
    </div>
  );
}
