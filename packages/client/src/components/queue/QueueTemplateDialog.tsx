/**
 * QueueTemplateDialog - Modal dialog for generating queue scripts from templates
 * [Source: Story 15.5 - Task 6]
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Save, Upload, Trash2, Pencil, RefreshCw } from 'lucide-react';
import { generateQueueFromTemplate } from '@bmad-studio/shared';
import type { QueueStoryInfo, QueueTemplate } from '@bmad-studio/shared';
import { queueApi } from '../../services/api/queue';
import { highlightScript } from './queueHighlight';
import { normalizeLineEndings, readQueueWrapMode, writeQueueWrapMode } from './wrapMode';

interface QueueTemplateDialogProps {
  projectSlug: string;
  open: boolean;
  onClose: () => void;
  onGenerate: (script: string) => void;
}

type TemplateSource = 'input' | 'file' | 'saved';

export function QueueTemplateDialog({ projectSlug, open, onClose, onGenerate }: QueueTemplateDialogProps) {
  // Template input state
  const [templateSource, setTemplateSource] = useState<TemplateSource>('input');
  const [templateText, setTemplateText] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<QueueTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Story selection state
  const [stories, setStories] = useState<QueueStoryInfo[]>([]);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [insertPause, setInsertPause] = useState(true);

  // UI state
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isAutoWrap, setIsAutoWrap] = useState(() => readQueueWrapMode(true));

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch stories and templates on open
  useEffect(() => {
    if (!open) return;

    setIsLoadingStories(true);
    setStoriesError(null);
    queueApi.getStories(projectSlug)
      .then((data) => {
        setStories(data.stories);
        setSelectedStories(new Set(data.stories.map((s) => s.storyNum)));
      })
      .catch(() => setStoriesError('스토리를 불러올 수 없습니다'))
      .finally(() => setIsLoadingStories(false));

    setIsLoadingTemplates(true);
    setTemplatesError(null);
    queueApi.getTemplates(projectSlug)
      .then((data) => setSavedTemplates(data))
      .catch(() => setTemplatesError('저장된 템플릿을 불러올 수 없습니다'))
      .finally(() => setIsLoadingTemplates(false));
  }, [open, projectSlug]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = dialog.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusables.length > 0) focusables[0].focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const current = dialog.querySelectorAll<HTMLElement>(focusableSelector);
      if (current.length === 0) return;
      const first = current[0];
      const last = current[current.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  // Keep wrap mode in sync with QueueEditor
  useEffect(() => {
    writeQueueWrapMode(isAutoWrap);
  }, [isAutoWrap]);

  // Generate preview
  const selectedStoriesList = useMemo(() => {
    return stories.filter((s) => selectedStories.has(s.storyNum));
  }, [stories, selectedStories]);

  const preview = useMemo(() => {
    if (!templateText || selectedStoriesList.length === 0) return '';
    return generateQueueFromTemplate(templateText, selectedStoriesList, insertPause);
  }, [templateText, selectedStoriesList, insertPause]);

  const previewHtml = useMemo(() => {
    return preview ? highlightScript(preview) : '';
  }, [preview]);

  // Group stories by epic
  const epicGroups = useMemo(() => {
    const groups = new Map<number, QueueStoryInfo[]>();
    for (const story of stories) {
      const group = groups.get(story.epicNum) || [];
      group.push(story);
      groups.set(story.epicNum, group);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [stories]);

  // Handlers
  const handleSelectAll = useCallback(() => {
    setSelectedStories(new Set(stories.map((s) => s.storyNum)));
  }, [stories]);

  const handleDeselectAll = useCallback(() => {
    setSelectedStories(new Set());
  }, []);

  const toggleStory = useCallback((storyNum: string) => {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      if (next.has(storyNum)) next.delete(storyNum);
      else next.add(storyNum);
      return next;
    });
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      alert('파일이 비어있습니다');
      e.target.value = '';
      return;
    }
    if (file.size > 102_400) {
      alert('파일이 너무 큽니다 (최대 100KB)');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setTemplateText(normalizeLineEndings(content));
        setSelectedTemplateId(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    const normalizedTemplate = normalizeLineEndings(templateText);
    if (!templateName.trim() || !normalizedTemplate.trim()) return;
    try {
      if (selectedTemplateId) {
        await queueApi.updateTemplate(projectSlug, selectedTemplateId, templateName.trim(), normalizedTemplate);
      } else {
        await queueApi.saveTemplate(projectSlug, templateName.trim(), normalizedTemplate);
      }
      const updated = await queueApi.getTemplates(projectSlug);
      setSavedTemplates(updated);
      setSaveDialogOpen(false);
      setTemplateName('');
      setSelectedTemplateId(null);
    } catch {
      alert(selectedTemplateId ? '템플릿 업데이트에 실패했습니다' : '템플릿 저장에 실패했습니다');
    }
  }, [projectSlug, templateName, templateText, selectedTemplateId]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    if (!window.confirm('템플릿을 삭제하시겠습니까?')) return;
    try {
      await queueApi.deleteTemplate(projectSlug, id);
      const updated = await queueApi.getTemplates(projectSlug);
      setSavedTemplates(updated);
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null);
        setTemplateText('');
      }
    } catch {
      alert('템플릿 삭제에 실패했습니다');
    }
  }, [projectSlug, selectedTemplateId]);

  const handleEditTemplate = useCallback((tmpl: QueueTemplate) => {
    setTemplateText(normalizeLineEndings(tmpl.template));
    setSelectedTemplateId(tmpl.id);
    setTemplateName(tmpl.name);
    setTemplateSource('input');
  }, []);

  const handleSelectSavedTemplate = useCallback((tmpl: QueueTemplate) => {
    setTemplateText(normalizeLineEndings(tmpl.template));
    setSelectedTemplateId(tmpl.id);
    setTemplateName(tmpl.name);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!preview) return;
    onGenerate(preview);
  }, [preview, onGenerate]);

  const retryLoadStories = useCallback(() => {
    setIsLoadingStories(true);
    setStoriesError(null);
    queueApi.getStories(projectSlug)
      .then((data) => {
        setStories(data.stories);
        setSelectedStories(new Set(data.stories.map((s) => s.storyNum)));
      })
      .catch(() => setStoriesError('스토리를 불러올 수 없습니다'))
      .finally(() => setIsLoadingStories(false));
  }, [projectSlug]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="template-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            템플릿으로 큐 생성
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Section 1: Template */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">1. 템플릿</h3>

            {/* Source tabs */}
            <div className="flex gap-1 mb-3">
              {(['input', 'file', 'saved'] as TemplateSource[]).map((source) => (
                <button
                  key={source}
                  onClick={() => {
                    setTemplateSource(source);
                    if (source !== 'saved' && source !== 'input') {
                      setSelectedTemplateId(null);
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md min-h-[44px] ${
                    templateSource === source
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {source === 'input' ? '직접 입력' : source === 'file' ? '파일 로드' : '저장된 템플릿'}
                </button>
              ))}
            </div>

            <div className="flex justify-end mb-3">
              <button
                onClick={() => setIsAutoWrap((prev) => !prev)}
                aria-label="Toggle template wrap mode"
                aria-pressed={isAutoWrap}
                className={`px-3 py-1.5 text-sm rounded-md min-h-[44px] ${
                  isAutoWrap
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {isAutoWrap ? 'Auto wrap' : 'No wrap'}
              </button>
            </div>

            {/* Input tab */}
            {templateSource === 'input' && (
              <textarea
                value={templateText}
                onChange={(e) => {
                  setTemplateText(e.target.value);
                  if (!selectedTemplateId) setTemplateName('');
                }}
                wrap={isAutoWrap ? 'soft' : 'off'}
                placeholder={'예: /dev {story_num} 스토리를 구현해주세요\n@pause 리뷰 후 계속'}
                className="w-full h-32 px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-y"
                style={{ whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre' }}
              />
            )}

            {/* File tab */}
            {templateSource === 'file' && (
              <div className="flex flex-col items-center gap-2 py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                <Upload className="w-8 h-8 text-gray-400" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700
                    text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                >
                  파일 선택 (.txt, .qlaude-queue)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.qlaude-queue"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {templateText && (
                  <p className="text-xs text-gray-500">템플릿이 로드되었습니다</p>
                )}
              </div>
            )}

            {/* Saved templates tab */}
            {templateSource === 'saved' && (
              <div className="space-y-2">
                {isLoadingTemplates && (
                  <p className="text-sm text-gray-500 py-2">로딩 중...</p>
                )}
                {templatesError && (
                  <p className="text-sm text-red-500 py-2">{templatesError}</p>
                )}
                {!isLoadingTemplates && !templatesError && savedTemplates.length === 0 && (
                  <p className="text-sm text-gray-500 py-2">저장된 템플릿이 없습니다</p>
                )}
                {savedTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer min-h-[44px] ${
                      selectedTemplateId === tmpl.id
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                    }`}
                    onClick={() => handleSelectSavedTemplate(tmpl)}
                  >
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{tmpl.name}</span>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditTemplate(tmpl); }}
                        aria-label={`${tmpl.name} 편집`}
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id); }}
                        aria-label={`${tmpl.name} 삭제`}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Save template button */}
            {templateText && (
              <div className="mt-2">
                {!saveDialogOpen ? (
                  <button
                    onClick={() => {
                      setSaveDialogOpen(true);
                      if (!templateName) setTemplateName('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
                      bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                      hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {selectedTemplateId ? '템플릿 업데이트' : '현재 템플릿 저장'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="템플릿 이름"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                        bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-[44px]"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); }}
                    />
                    <button
                      onClick={handleSaveTemplate}
                      disabled={!templateName.trim()}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white
                        hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setSaveDialogOpen(false)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700
                        text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 2: Story selection */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">2. 스토리 선택</h3>

            {isLoadingStories && (
              <p className="text-sm text-gray-500 py-2">스토리 로딩 중...</p>
            )}

            {storiesError && (
              <div className="flex items-center gap-2 py-2">
                <p className="text-sm text-red-500">{storiesError}</p>
                <button
                  onClick={retryLoadStories}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700
                    text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                >
                  <RefreshCw className="w-3 h-3" />
                  재시도
                </button>
              </div>
            )}

            {!isLoadingStories && !storiesError && stories.length === 0 && (
              <p className="text-sm text-gray-500 py-2">PRD에서 스토리를 찾을 수 없습니다</p>
            )}

            {!isLoadingStories && !storiesError && stories.length > 0 && (
              <>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700
                      text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-700
                      text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
                  >
                    전체 해제
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
                  {epicGroups.map(([epicNum, epicStories]) => (
                    <div key={epicNum}>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1 py-0.5 mt-1 first:mt-0">
                        Epic {epicNum}
                      </div>
                      {epicStories.map((story) => (
                        <label
                          key={story.storyNum}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer min-h-[44px]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStories.has(story.storyNum)}
                            onChange={() => toggleStory(story.storyNum)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {story.storyNum}
                            {story.title && <span className="text-gray-500 dark:text-gray-400"> - {story.title}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Options */}
          <section>
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={insertPause}
                onChange={(e) => setInsertPause(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">에픽 간 @pause 자동 삽입</span>
            </label>
          </section>

          {/* Section 3: Preview */}
          {preview && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">3. 미리보기</h3>
              <pre
                className="max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-sm"
                style={{
                  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                  lineHeight: '1.5',
                  whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre',
                  overflowWrap: isAutoWrap ? 'anywhere' : 'normal',
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml + '\n' }}
              />
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700
              text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 min-h-[44px]"
          >
            취소
          </button>
          <button
            onClick={handleGenerate}
            disabled={!preview}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            에디터에 로드
          </button>
        </div>
      </div>
    </div>
  );
}
