/**
 * QueueTemplateDialog - Modal dialog for generating queue scripts from templates.
 * Two-tab layout: Load (browse/upload templates) and Editor (edit/save templates).
 * Apply flow adds story selection + preview before loading to queue editor.
 * [Source: Story 15.5 - Task 6]
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Upload, Trash2, RefreshCw, WrapText, Globe, FolderOpen } from 'lucide-react';
import { generateQueueFromTemplate } from '@hammoc/shared';
import type { QueueStoryInfo, QueueTemplate } from '@hammoc/shared';
import { queueApi } from '../../services/api/queue';
import { highlightScript } from './queueHighlight';
import { normalizeLineEndings, readQueueWrapMode, writeQueueWrapMode } from './wrapMode';

type TemplateScope = 'project' | 'global';
type ActiveTab = 'load' | 'editor';

interface QueueTemplateDialogProps {
  projectSlug: string;
  open: boolean;
  onClose: () => void;
  onGenerate: (script: string) => void;
}

export function QueueTemplateDialog({ projectSlug, open, onClose, onGenerate }: QueueTemplateDialogProps) {
  const { t } = useTranslation('common');

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('load');

  // Template data
  const [savedTemplates, setSavedTemplates] = useState<QueueTemplate[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<QueueTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // Load tab — file upload + radio selection
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null);
  const [selectedRadio, setSelectedRadio] = useState<string | null>(null); // 'upload' | 'project:{id}' | 'global:{id}'

  // Editor tab
  const [templateText, setTemplateText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [saveScope, setSaveScope] = useState<TemplateScope>('project');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [isAutoWrap, setIsAutoWrap] = useState(() => readQueueWrapMode(true));

  // Apply flow — story selection
  const [showApplySection, setShowApplySection] = useState(false);
  const [stories, setStories] = useState<QueueStoryInfo[]>([]);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [insertPause, setInsertPause] = useState(true);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Effects ──

  useEffect(() => {
    if (!open) return;
    // Reset UI state on open
    setActiveTab('load');
    setUploadedFile(null);
    setSelectedRadio(null);
    setTemplateText('');
    setTemplateName('');
    setSaveStatus(null);
    setEditorDirty(false);
    setShowApplySection(false);
    setSaveScope('project');

    // Fetch stories
    setIsLoadingStories(true);
    setStoriesError(null);
    queueApi.getStories(projectSlug)
      .then((data) => {
        setStories(data.stories);
        setSelectedStories(new Set(data.stories.map((s) => s.storyNum)));
      })
      .catch(() => setStoriesError(t('queue.template.storyLoadFailed')))
      .finally(() => setIsLoadingStories(false));

    // Fetch templates
    setIsLoadingTemplates(true);
    setTemplatesError(null);
    Promise.allSettled([
      queueApi.getTemplates(projectSlug),
      queueApi.getGlobalTemplates(projectSlug),
    ])
      .then(([projectResult, globalResult]) => {
        if (projectResult.status === 'fulfilled') setSavedTemplates(projectResult.value);
        if (globalResult.status === 'fulfilled') setGlobalTemplates(globalResult.value);
        if (projectResult.status === 'rejected' && globalResult.status === 'rejected') {
          setTemplatesError(t('queue.template.templateLoadFailed'));
        }
      })
      .finally(() => setIsLoadingTemplates(false));
  }, [open, projectSlug]);

  // Focus trap
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const els = dialog.querySelectorAll<HTMLElement>(sel);
    if (els.length > 0) els[0].focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const cur = dialog.querySelectorAll<HTMLElement>(sel);
      if (cur.length === 0) return;
      const first = cur[0], last = cur[cur.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => { writeQueueWrapMode(isAutoWrap); }, [isAutoWrap]);

  // ── Memos ──

  const selectedContent = useMemo(() => {
    if (!selectedRadio) return null;
    if (selectedRadio === 'upload' && uploadedFile) {
      return { name: uploadedFile.name, content: uploadedFile.content, source: 'upload' as const };
    }
    for (const tmpl of savedTemplates) {
      if (selectedRadio === `project:${tmpl.id}`) {
        return { name: tmpl.name, content: tmpl.template, source: 'project' as const, id: tmpl.id };
      }
    }
    for (const tmpl of globalTemplates) {
      if (selectedRadio === `global:${tmpl.id}`) {
        return { name: tmpl.name, content: tmpl.template, source: 'global' as const, id: tmpl.id };
      }
    }
    return null;
  }, [selectedRadio, uploadedFile, savedTemplates, globalTemplates]);

  const selectedStoriesList = useMemo(
    () => stories.filter((s) => selectedStories.has(s.storyNum)),
    [stories, selectedStories],
  );

  const preview = useMemo(() => {
    if (!templateText || selectedStoriesList.length === 0) return '';
    return generateQueueFromTemplate(templateText, selectedStoriesList, insertPause);
  }, [templateText, selectedStoriesList, insertPause]);

  const previewHtml = useMemo(
    () => (preview ? highlightScript(preview) : ''),
    [preview],
  );

  const epicGroups = useMemo(() => {
    const groups = new Map<number | string, QueueStoryInfo[]>();
    for (const story of stories) {
      const group = groups.get(story.epicNum) || [];
      group.push(story);
      groups.set(story.epicNum, group);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === b[0]) return 0;
      const aIsNum = typeof a[0] === 'number';
      const bIsNum = typeof b[0] === 'number';
      if (aIsNum && bIsNum) return (a[0] as number) - (b[0] as number);
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      if (a[0] === 'BS') return 1;
      if (b[0] === 'BS') return -1;
      return String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true });
    });
  }, [stories]);

  // ── Handlers ──

  const refreshTemplates = useCallback(async () => {
    const results = await Promise.allSettled([
      queueApi.getTemplates(projectSlug),
      queueApi.getGlobalTemplates(projectSlug),
    ]);
    if (results[0].status === 'fulfilled') setSavedTemplates(results[0].value);
    if (results[1].status === 'fulfilled') setGlobalTemplates(results[1].value);
  }, [projectSlug]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size === 0) { alert(t('queue.template.fileEmpty')); e.target.value = ''; return; }
    if (file.size > 102_400) { alert(t('queue.template.fileTooLarge')); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        const normalized = normalizeLineEndings(content);
        setUploadedFile({ name: file.name, content: normalized });
        setSelectedRadio('upload');
      }
    };
    reader.onerror = () => { alert(t('queue.fileReadError', { name: file.name })); };
    reader.readAsText(file);
    e.target.value = '';
  }, [t]);

  const handleDeleteTemplate = useCallback(async (id: string, scope: TemplateScope) => {
    if (!window.confirm(t('queue.template.templateDeleteConfirm'))) return;
    try {
      if (scope === 'global') await queueApi.deleteGlobalTemplate(projectSlug, id);
      else await queueApi.deleteTemplate(projectSlug, id);
      setSelectedRadio((prev) => (prev === `${scope}:${id}` ? null : prev));
      await refreshTemplates();
    } catch {
      alert(t('queue.template.templateDeleteFailed'));
    }
  }, [projectSlug, refreshTemplates]);

  const handleEditClick = useCallback(() => {
    if (!selectedContent) return;
    setTemplateText(normalizeLineEndings(selectedContent.content));
    setTemplateName(selectedContent.name);
    if (selectedContent.source !== 'upload') setSaveScope(selectedContent.source);
    setSaveStatus(null);
    setEditorDirty(false);
    setActiveTab('editor');
    setShowApplySection(false);
  }, [selectedContent]);

  const handleApplyClick = useCallback(() => {
    if (activeTab === 'load') {
      if (!selectedContent) return;
      setTemplateText(normalizeLineEndings(selectedContent.content));
      setEditorDirty(false);
      setSaveStatus(null);
    }
    setShowApplySection(true);
  }, [activeTab, selectedContent]);

  const handleSaveInEditor = useCallback(async () => {
    if (!templateName.trim() || !templateText.trim() || isSaving) return;
    const normalizedTemplate = normalizeLineEndings(templateText);
    const targetList = saveScope === 'global' ? globalTemplates : savedTemplates;
    const existing = targetList.find((tmpl) => tmpl.name.trim() === templateName.trim());

    if (existing) {
      if (!window.confirm(t('queue.template.overwriteConfirm'))) return;
    }

    setIsSaving(true);
    try {
      if (existing) {
        if (saveScope === 'global') {
          await queueApi.updateGlobalTemplate(projectSlug, existing.id, templateName.trim(), normalizedTemplate);
        } else {
          await queueApi.updateTemplate(projectSlug, existing.id, templateName.trim(), normalizedTemplate);
        }
      } else {
        if (saveScope === 'global') {
          await queueApi.saveGlobalTemplate(projectSlug, templateName.trim(), normalizedTemplate);
        } else {
          await queueApi.saveTemplate(projectSlug, templateName.trim(), normalizedTemplate);
        }
      }
      setSaveStatus({ type: 'success', message: t('queue.template.saveSuccess') });
      setEditorDirty(false);
    } catch {
      setSaveStatus({ type: 'error', message: t('queue.template.templateSaveFailed') });
    }
    try { await refreshTemplates(); } catch { /* refresh failure is non-critical */ }
    setIsSaving(false);
  }, [projectSlug, templateName, templateText, saveScope, isSaving, savedTemplates, globalTemplates, refreshTemplates]);

  const handleGenerate = useCallback(() => {
    if (!preview) return;
    onGenerate(preview);
  }, [preview, onGenerate]);

  const handleSelectAll = useCallback(() => setSelectedStories(new Set(stories.map((s) => s.storyNum))), [stories]);
  const handleDeselectAll = useCallback(() => setSelectedStories(new Set()), []);

  const toggleStory = useCallback((storyNum: string) => {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      if (next.has(storyNum)) next.delete(storyNum); else next.add(storyNum);
      return next;
    });
  }, []);

  const toggleEpic = useCallback((epicStories: QueueStoryInfo[]) => {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      const allSelected = epicStories.every((s) => prev.has(s.storyNum));
      for (const s of epicStories) { if (allSelected) next.delete(s.storyNum); else next.add(s.storyNum); }
      return next;
    });
  }, []);

  const retryLoadStories = useCallback(() => {
    setIsLoadingStories(true);
    setStoriesError(null);
    queueApi.getStories(projectSlug)
      .then((data) => { setStories(data.stories); setSelectedStories(new Set(data.stories.map((s) => s.storyNum))); })
      .catch(() => setStoriesError(t('queue.template.storyLoadFailed')))
      .finally(() => setIsLoadingStories(false));
  }, [projectSlug, t]);

  const confirmUnsaved = useCallback(() => {
    if (!editorDirty) return true;
    return window.confirm(t('queue.template.unsavedChanges'));
  }, [editorDirty]);

  const handleClose = useCallback(() => {
    if (!confirmUnsaved()) return;
    onClose();
  }, [confirmUnsaved, onClose]);

  // Close on Escape — apply modal takes priority
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showApplySection) { setShowApplySection(false); }
        else { handleClose(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose, showApplySection]);

  const switchTab = useCallback((tab: ActiveTab) => {
    if (activeTab === 'editor' && tab !== 'editor' && !confirmUnsaved()) return;
    if (activeTab === 'editor' && tab !== 'editor') setEditorDirty(false);
    setActiveTab(tab);
    setShowApplySection(false);
  }, [activeTab, confirmUnsaved]);

  if (!open) return null;

  // ── Helpers ──

  const radioClass = (value: string) =>
    `flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors rounded-md ${
      selectedRadio === value
        ? 'bg-blue-50 dark:bg-blue-900/20'
        : 'hover:bg-gray-50 dark:hover:bg-[#253040]/50'
    }`;

  const tabClass = (tab: ActiveTab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col mx-4
          ring-1 ring-gray-200 dark:ring-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
          <h2 id="template-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('queue.template.title')}
          </h2>
          <button
            onClick={handleClose}
            aria-label={t('queue.template.close')}
            className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
              hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex px-5 border-b border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
          <button onClick={() => switchTab('load')} className={tabClass('load')}>
            {t('queue.template.tabLoad')}
          </button>
          <button onClick={() => switchTab('editor')} className={tabClass('editor')}>
            {t('queue.template.tabEditor')}
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 py-4 space-y-4">

            {/* ════ LOAD TAB ════ */}
            {activeTab === 'load' && (
              <section className="space-y-1">
                {/* File upload */}
                <div className="mb-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
                      border border-gray-300 dark:border-[#455568] text-gray-600 dark:text-gray-300
                      hover:bg-gray-50 dark:hover:bg-[#253040] transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {t('queue.template.chooseFile')}
                  </button>
                  <input ref={fileInputRef} type="file" accept=".txt,.qlaude-queue" onChange={handleFileChange} className="hidden" />
                </div>

                {uploadedFile && (
                  <label className={radioClass('upload')}>
                    <input
                      type="radio"
                      name="template-source"
                      checked={selectedRadio === 'upload'}
                      onChange={() => setSelectedRadio('upload')}
                      className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <Upload className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{uploadedFile.name}</span>
                  </label>
                )}

                {/* Loading / error */}
                {isLoadingTemplates && (
                  <p className="text-sm text-gray-400 py-3 text-center">{t('queue.template.loading')}</p>
                )}
                {templatesError && (
                  <p className="text-sm text-red-500 py-3 text-center">{templatesError}</p>
                )}

                {/* Project templates */}
                {!isLoadingTemplates && !templatesError && (
                  <>
                    <div className="flex items-center gap-1.5 px-2 pt-3 pb-0.5">
                      <FolderOpen className="w-3 h-3 text-gray-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {t('queue.template.projectTemplates')}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">({savedTemplates.length})</span>
                    </div>
                    {savedTemplates.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1.5 px-3 text-center">{t('queue.template.noProjectTemplates')}</p>
                    ) : (
                      savedTemplates.map((tmpl) => (
                        <label key={tmpl.id} className={`group ${radioClass(`project:${tmpl.id}`)}`}>
                          <input
                            type="radio"
                            name="template-source"
                            checked={selectedRadio === `project:${tmpl.id}`}
                            onChange={() => setSelectedRadio(`project:${tmpl.id}`)}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{tmpl.name}</span>
                          <button
                            onClick={(e) => { e.preventDefault(); handleDeleteTemplate(tmpl.id, 'project'); }}
                            aria-label={t('queue.template.deleteTemplate', { name: tmpl.name })}
                            className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                              transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </label>
                      ))
                    )}

                    {/* Global templates */}
                    <div className="flex items-center gap-1.5 px-2 pt-3 pb-0.5">
                      <Globe className="w-3 h-3 text-gray-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {t('queue.template.globalTemplates')}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">({globalTemplates.length})</span>
                    </div>
                    {globalTemplates.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1.5 px-3 text-center">{t('queue.template.noGlobalTemplates')}</p>
                    ) : (
                      globalTemplates.map((tmpl) => (
                        <label key={tmpl.id} className={`group ${radioClass(`global:${tmpl.id}`)}`}>
                          <input
                            type="radio"
                            name="template-source"
                            checked={selectedRadio === `global:${tmpl.id}`}
                            onChange={() => setSelectedRadio(`global:${tmpl.id}`)}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{tmpl.name}</span>
                          <button
                            onClick={(e) => { e.preventDefault(); handleDeleteTemplate(tmpl.id, 'global'); }}
                            aria-label={t('queue.template.deleteTemplate', { name: tmpl.name })}
                            className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                              transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </label>
                      ))
                    )}
                  </>
                )}
              </section>
            )}

            {/* ════ EDITOR TAB ════ */}
            {activeTab === 'editor' && (
              <section className="space-y-3">
                <div className="rounded-lg border border-gray-300 dark:border-[#3a4d5e] overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 dark:bg-[#263240]/80 border-b border-gray-300 dark:border-[#3a4d5e]">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate select-none">
                      {t('queue.template.variablesHint', { variables: '{story_num}, {epic_num}, {story_index}, {story_title}, {date}' })}
                    </span>
                    <button
                      onClick={() => setIsAutoWrap((prev) => !prev)}
                      aria-label={t('queue.template.toggleWrap')}
                      aria-pressed={isAutoWrap}
                      title={isAutoWrap ? t('queue.wrap') : t('queue.noWrap')}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                        isAutoWrap
                          ? 'bg-blue-100 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      <WrapText className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Textarea */}
                  <textarea
                    value={templateText}
                    onChange={(e) => { setTemplateText(e.target.value); setSaveStatus(null); setEditorDirty(true); }}
                    wrap={isAutoWrap ? 'soft' : 'off'}
                    placeholder={t('queue.template.placeholder')}
                    className="w-full h-40 px-3 py-2.5 text-sm font-mono bg-white dark:bg-[#1c2129]
                      text-gray-900 dark:text-gray-100 resize-y border-0 focus:ring-0 focus:outline-none
                      placeholder:text-gray-300 dark:placeholder:text-gray-600"
                    style={{ whiteSpace: isAutoWrap ? 'pre-wrap' : 'pre' }}
                  />
                </div>

                {/* Save form */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => { setTemplateName(e.target.value); setSaveStatus(null); }}
                      placeholder={t('queue.template.templateName')}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 dark:border-[#455568] rounded-md
                        bg-white dark:bg-[#263240] text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-400
                        focus:border-blue-400 outline-none min-w-0"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveInEditor(); }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    {/* Scope toggle */}
                    <div className="inline-flex p-0.5 bg-gray-200 dark:bg-[#253040] rounded-md">
                      <button
                        onClick={() => setSaveScope('project')}
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-all inline-flex items-center gap-1 ${
                          saveScope === 'project'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <FolderOpen className="w-3 h-3" />
                        {t('queue.template.scopeProject')}
                      </button>
                      <button
                        onClick={() => setSaveScope('global')}
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-all inline-flex items-center gap-1 ${
                          saveScope === 'global'
                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        {t('queue.template.scopeGlobal')}
                      </button>
                    </div>
                    <button
                      onClick={handleSaveInEditor}
                      disabled={!templateName.trim() || !templateText.trim() || isSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white
                        hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-3 h-3" />
                      {t('queue.template.save')}
                    </button>
                  </div>
                  {saveStatus && (
                    <p className={`text-xs ${saveStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {saveStatus.message}
                    </p>
                  )}
                </div>
              </section>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-3.5 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
          >
            {t('queue.template.cancel')}
          </button>

          {/* Load tab actions */}
          {activeTab === 'load' && selectedContent && (
            <>
              <button
                onClick={handleEditClick}
                className="px-4 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-[#455568]
                  text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#253040] transition-colors"
              >
                {t('queue.template.editBtn')}
              </button>
              <button
                onClick={handleApplyClick}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white
                  hover:bg-blue-500 transition-colors shadow-sm shadow-blue-600/20"
              >
                {t('queue.template.applyBtn')}
              </button>
            </>
          )}

          {/* Editor tab action */}
          {activeTab === 'editor' && (
            <button
              onClick={handleApplyClick}
              disabled={!templateText.trim()}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white
                hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                shadow-sm shadow-blue-600/20"
            >
              {t('queue.template.applyBtn')}
            </button>
          )}
        </div>
      </div>

      {/* ════ APPLY MODAL (stacked on top) ════ */}
      {showApplySection && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setShowApplySection(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-dialog-title"
            className="bg-white dark:bg-[#263240] rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col mx-4
              ring-1 ring-gray-200 dark:ring-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
              <h2 id="apply-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {t('queue.template.storySection')}
              </h2>
              <button
                onClick={() => setShowApplySection(false)}
                aria-label={t('queue.template.close')}
                className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4">
              {/* Controls bar */}
              {!isLoadingStories && !storiesError && stories.length > 0 && (
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={insertPause}
                      onChange={(e) => setInsertPause(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-[11px] text-gray-500 dark:text-gray-300">{t('queue.template.pauseBetweenEpics')}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      {selectedStories.size}/{stories.length}
                    </span>
                    <button
                      onClick={selectedStories.size === stories.length ? handleDeselectAll : handleSelectAll}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {selectedStories.size === stories.length ? t('queue.template.deselectAll') : t('queue.template.selectAll')}
                    </button>
                  </div>
                </div>
              )}

              {/* Story list */}
              {isLoadingStories && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-[#455568] border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
              {storiesError && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <p className="text-sm text-red-500">{storiesError}</p>
                  <button
                    onClick={retryLoadStories}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md
                      text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
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
                <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-300 dark:border-[#3a4d5e]
                  bg-gray-50/50 dark:bg-[#1c2129]/30 divide-y divide-gray-100 dark:divide-gray-700/50">
                  {epicGroups.map(([epicNum, epicStories]) => {
                    const allSelected = epicStories.every((s) => selectedStories.has(s.storyNum));
                    const someSelected = epicStories.some((s) => selectedStories.has(s.storyNum));
                    return (
                      <div key={epicNum}>
                        <button
                          onClick={() => toggleEpic(epicStories)}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-left
                            hover:bg-gray-100 dark:hover:bg-[#263240] transition-colors sticky top-0
                            bg-gray-50 dark:bg-[#263240] z-[1]"
                        >
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={() => toggleEpic(epicStories)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            {epicNum === 'BS'
                              ? t('queue.template.standaloneHeader')
                              : typeof epicNum === 'string'
                                ? epicNum
                                : t('queue.template.epicHeader', { num: epicNum })}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            ({epicStories.filter((s) => selectedStories.has(s.storyNum)).length}/{epicStories.length})
                          </span>
                        </button>
                        {epicStories.map((story) => (
                          <label
                            key={story.storyNum}
                            className="flex items-center gap-2.5 px-3 py-1.5 pl-7 cursor-pointer
                              hover:bg-gray-100/70 dark:hover:bg-[#263240]/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedStories.has(story.storyNum)}
                              onChange={() => toggleStory(story.storyNum)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                              <span className="font-mono text-gray-500 dark:text-gray-300">{story.storyNum}</span>
                              {story.title && <span className="text-gray-400 ml-1.5">{story.title}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Preview */}
              {preview && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2.5">
                    {t('queue.template.preview')}
                  </h3>
                  <pre
                    className="max-h-44 overflow-auto rounded-lg bg-gray-50 dark:bg-[#1c2129] p-3 text-xs ring-1 ring-gray-200 dark:ring-gray-800"
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

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#3a4d5e]/50 flex-shrink-0">
              <button
                onClick={() => setShowApplySection(false)}
                className="px-3.5 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-[#253040] transition-colors"
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
      )}
    </div>
  );
}
