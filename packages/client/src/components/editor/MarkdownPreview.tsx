import { MarkdownRenderer } from '../MarkdownRenderer';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
