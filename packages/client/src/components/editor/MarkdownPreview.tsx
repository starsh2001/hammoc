import { MarkdownRenderer } from '../MarkdownRenderer';
import { useFileStore } from '../../stores/fileStore';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const openFile = useFileStore((s) => s.openFile);
  const projectSlug = openFile?.projectSlug ?? null;
  // Base directory of the markdown file for relative path resolution
  const basePath = openFile?.path ? openFile.path.replace(/[^/\\]+$/, '').replace(/[\\/]$/, '') : '';

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-[#1c2129]">
      <div className="max-w-4xl mx-auto">
        <MarkdownRenderer content={content} projectSlug={projectSlug} basePath={basePath} />
      </div>
    </div>
  );
}
