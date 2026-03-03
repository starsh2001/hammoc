/**
 * QueueTemplateDialog - Modal dialog for generating queue scripts from templates
 * [Source: Story 15.5 - Task 6]
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Upload, Trash2, Pencil, RefreshCw, WrapText, ChevronRight, FileText } from 'lucide-react';
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

const sourceLabels: Record<TemplateSource, string> = {
  input: '직접 입력',
  file: '파일',
  saved: '저장됨',
};

export function QueueTemplateDialog({ projectSlug, open, onClose, onGenerate }: QueueTemplateDialogProps) {
  const { t } = useTranslation('common');
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
      .catch(() => setStoriesError(t('queue.template.storyLoadFailed')))
      .finally(() => setIsLoadingStories(false));

    setIsLoadingTemplates(true);
    setTemplatesError(null);
    queueApi.getTemplates(projectSlug)
      .then((data) => setSavedTemplates(data))
      .catch(() => setTemplatesError(t('queue.template.templateLoadFailed')))
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

  const toggleEpic = useCallback((epicStories: QueueStoryInfo[]) => {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      const allSelected = epicStories.every((s) => prev.has(s.storyNum));
      for (const s of epicStories) {
        if (allSelected) next.delete(s.storyNum);
        else next.add(s.storyNum);
      }
      return next;
    });
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      alert(t('queue.template.fileEmpty'));
      e.target.value = '';
      return;
    }
    if (file.size > 102_400) {
      alert(t('queue.template.fileTooLarge'));
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
      alert(selectedTemplateId ? t('queue.template.templateUpdateFailed') : t('queue.template.templateSaveFailed'));
    }
  }, [projectSlug, templateName, templateText, selectedTemplateId]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    if (!window.confirm(t('queue.template.templateDeleteConfirm'))) return;
    try {
      await queueApi.deleteTemplate(projectSlug, id);
      const updated = await queueApi.getTemplates(projectSlug);
      setSavedTemplates(updated);
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null);
        setTemplateText('');
      }
    } catch {
      alert(t('queue.template.templateDeleteFailed'));
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
      .catch(() => setStoriesError(t('queue.template.storyLoadFailed')))
      .finally(() => setIsLoadingStories(false));
  }, [projectSlug, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col mx-4
          ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
          <h2 id="template-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('queue.template.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('queue.template.close')}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4">

            {/* ── Template section ── */}
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {t('queue.template.templateSection')}
                </h3>
                {templateText && !saveDialogOpen && (
                  <button
                    onClick={() => {
                      setSaveDialogOpen(true);
                      if (!templateName) setTemplateName('');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400
                      hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    <Save className="w-3 h-3" />
                    {selectedTemplateId ? t('queue.template.update') : t('queue.template.save')}
                  </button>
                )}
              </div>

              {/* Source tabs — pill style */}
              <div className="inline-flex p-0.5 bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-3">
                {(['input', 'file', 'saved'] as TemplateSource[]).map((source) => (
                  <button
                    key={source}
                    onClick={() => {
                      setTemplateSource(source);
                      if (source !== 'saved' && source !== 'input') {
                        setSelectedTemplateId(null);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      templateSource === source
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {sourceLabels[source]}
                  </button>
                ))}
              </div>

              {/* Input tab */}
              {templateSource === 'input' && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* Textarea mini-toolbar */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                      {t('queue.template.variablesHint', { variables: '{story_num}, {epic_num}, {story_title}' })}
                    </span>
                    <button
                      onClick={() => setIsAutoWrap((prev) => !prev)}
                      aria-label={t('queue.template.toggleWrap')}
                      aria-pressed={isAutoWrap}
                      title={isAutoWrap ? t('queue.wrap') : t('queue.noWrap')}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                        isAutoWrap
                          ? 'bg-blue-100 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      <WrapText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={templateText}
                    onChange={(e) => {
                      setTemplateText(e.target.value);
                      if (!selectedTemplateId) setTemplateName('');
                    }}
                    wrap={isAutoWrap ? 'soft' : 'off'}
                    placeholder={t('queue.template.placeholder')}
                    className="w-full h-28 px-3 py-2.5 text-sm font-mono bg-white dark:bg-gray-900
                      text-gray-900 dark:text-gray-100 resize-y border-0 focus:ring-0 focus:outline-none
                      placeholder:text-gray-300 dark:placeholder:text-gray-600"
                    style={{ whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre' }}
                  />
                </div>
              )}

              {/* File tab */}
              {templateSource === 'file' && (
                <div
                  className="flex flex-col items-center gap-2.5 py-6 border-2 border-dashed border-gray-200
                    dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 cursor-pointer
                    hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('queue.template.clickToSelectFile')}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('queue.template.fileTypes')}</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.qlaude-queue"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {templateText && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                      bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      {t('queue.template.loaded')}
                    </span>
                  )}
                </div>
              )}

              {/* Saved templates tab */}
              {templateSource === 'saved' && (
                <div className="space-y-1.5">
                  {isLoadingTemplates && (
                    <p className="text-sm text-gray-400 py-3 text-center">{t('queue.template.loading')}</p>
                  )}
                  {templatesError && (
                    <p className="text-sm text-red-500 py-3 text-center">{templatesError}</p>
                  )}
                  {!isLoadingTemplates && !templatesError && savedTemplates.length === 0 && (
                    <div className="flex flex-col items-center gap-1.5 py-6 text-gray-400">
                      <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm">{t('queue.template.noSavedTemplates')}</p>
                    </div>
                  )}
                  {savedTemplates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedTemplateId === tmpl.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleSelectSavedTemplate(tmpl)}
                    >
                      <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                        selectedTemplateId === tmpl.id
                          ? 'text-blue-500'
                          : 'text-gray-300 dark:text-gray-600'
                      }`} />
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{tmpl.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditTemplate(tmpl); }}
                          aria-label={t('queue.template.editTemplate', { name: tmpl.name })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                            hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id); }}
                          aria-label={t('queue.template.deleteTemplate', { name: tmpl.name })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500
                            hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save template inline form */}
              {saveDialogOpen && (
                <div className="flex items-center gap-2 mt-2.5 p-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={t('queue.template.templateName')}
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-400
                      focus:border-blue-400 outline-none"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); if (e.key === 'Escape') setSaveDialogOpen(false); }}
                  />
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim()}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white
                      hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {t('queue.template.save')}
                  </button>
                  <button
                    onClick={() => setSaveDialogOpen(false)}
                    className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    {t('queue.template.cancel')}
                  </button>
                </div>
              )}
            </section>

            {/* ── Story selection section ── */}
            <section>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {t('queue.template.storySection')}
                  {!isLoadingStories && !storiesError && stories.length > 0 && (
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-300 dark:text-gray-600">
                      {selectedStories.size}/{stories.length}
                    </span>
                  )}
                </h3>
                {!isLoadingStories && !storiesError && stories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={insertPause}
                        onChange={(e) => setInsertPause(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{t('queue.template.pauseBetweenEpics')}</span>
                    </label>
                    <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700" />
                    <button
                      onClick={selectedStories.size === stories.length ? handleDeselectAll : handleSelectAll}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {selectedStories.size === stories.length ? t('queue.template.deselectAll') : t('queue.template.selectAll')}
                    </button>
                  </div>
                )}
              </div>

              {isLoadingStories && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}

              {storiesError && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <p className="text-sm text-red-500">{storiesError}</p>
                  <button
                    onClick={retryLoadStories}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md
                      text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t('button.retry')}
                  </button>
                </div>
              )}

              {!isLoadingStories && !storiesError && stories.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">{t('queue.template.noStoriesFound')}</p>
              )}

              {!isLoadingStories && !storiesError && stories.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700
                  bg-gray-50/50 dark:bg-gray-900/30 divide-y divide-gray-100 dark:divide-gray-700/50">
                  {epicGroups.map(([epicNum, epicStories]) => {
                    const allSelected = epicStories.every((s) => selectedStories.has(s.storyNum));
                    const someSelected = epicStories.some((s) => selectedStories.has(s.storyNum));
                    return (
                      <div key={epicNum}>
                        {/* Epic group header */}
                        <button
                          onClick={() => toggleEpic(epicStories)}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-left
                            hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sticky top-0
                            bg-gray-50 dark:bg-gray-800 z-[1]"
                        >
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={() => toggleEpic(epicStories)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('queue.template.epicHeader', { num: epicNum })}
                          </span>
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">
                            ({epicStories.filter((s) => selectedStories.has(s.storyNum)).length}/{epicStories.length})
                          </span>
                        </button>

                        {/* Story items */}
                        {epicStories.map((story) => (
                          <label
                            key={story.storyNum}
                            className="flex items-center gap-2.5 px-3 py-1.5 pl-7 cursor-pointer
                              hover:bg-gray-100/70 dark:hover:bg-gray-800/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedStories.has(story.storyNum)}
                              onChange={() => toggleStory(story.storyNum)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                              <span className="font-mono text-gray-500 dark:text-gray-400">{story.storyNum}</span>
                              {story.title && (
                                <span className="text-gray-400 dark:text-gray-500 ml-1.5">
                                  {story.title}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Preview section ── */}
            {preview && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2.5">
                  {t('queue.template.preview')}
                </h3>
                <pre
                  className="max-h-44 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-xs ring-1 ring-gray-200 dark:ring-gray-800"
                  style={{
                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                    lineHeight: '1.6',
                    whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre',
                    overflowWrap: isAutoWrap ? 'anywhere' : 'normal',
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHtml + '\n' }}
                />
              </section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-700/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-400
              hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {t('queue.template.cancel')}
          </button>
          <button
            onClick={handleGenerate}
            disabled={!preview}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              shadow-sm shadow-blue-600/20"
          >
            {t('queue.template.loadToEditor')}
          </button>
        </div>
      </div>
    </div>
  );
}
