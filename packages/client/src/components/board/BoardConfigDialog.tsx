/**
 * BoardConfigDialog - Configure board columns and badge-to-column mapping
 * [Source: Custom board config feature, Badge-based column mapping]
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { BoardConfig, BoardColumnConfig } from '@hammoc/shared';
import { COLUMN_COLOR_PALETTE, DEFAULT_BOARD_CONFIG, REQUIRED_COLUMN_IDS, validateBoardConfig } from '@hammoc/shared';
import { generateUUID } from '../../utils/uuid';
import { ALL_BADGE_IDS, getBadgeById } from './constants';

interface BoardConfigDialogProps {
  open: boolean;
  config: BoardConfig;
  onClose: () => void;
  onSave: (config: BoardConfig) => Promise<void>;
  onReset: () => Promise<void>;
}

const REQUIRED_IDS = new Set<string>(REQUIRED_COLUMN_IDS);

// Color swatch display name (extract color from class)
function colorSwatchClass(colorClass: string): string {
  return colorClass.replace('border-t-', 'bg-');
}

export function BoardConfigDialog({ open, config, onClose, onSave, onReset }: BoardConfigDialogProps) {
  const { t } = useTranslation('board');
  const [columns, setColumns] = useState<BoardColumnConfig[]>([]);
  const [badgeMap, setBadgeMap] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setColumns(config.columns.map((c) => ({ ...c })));
      setBadgeMap({ ...config.badgeToColumn });
      setErrors([]);
      setOpenColorPicker(null);
    }
  }, [open, config]);

  // Escape key
  const handleClose = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  const handleAddColumn = () => {
    if (columns.length >= 10) return;
    const usedColors = new Set(columns.map((c) => c.colorClass));
    const nextColor = COLUMN_COLOR_PALETTE.find((c) => !usedColors.has(c)) ?? COLUMN_COLOR_PALETTE[0];
    const id = `col-${generateUUID().slice(0, 8)}`;
    setColumns([...columns, { id, label: '', colorClass: nextColor }]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 1) return;
    const removed = columns[index];
    if (REQUIRED_IDS.has(removed.id)) return;
    const newColumns = columns.filter((_, i) => i !== index);
    setColumns(newColumns);
    // Re-map any badges pointing to removed column to first column
    const newMap = { ...badgeMap };
    for (const [badge, target] of Object.entries(newMap)) {
      if (target === removed.id) {
        newMap[badge] = newColumns[0].id;
      }
    }
    setBadgeMap(newMap);
  };

  const handleMoveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const newColumns = [...columns];
    [newColumns[index], newColumns[target]] = [newColumns[target], newColumns[index]];
    setColumns(newColumns);
  };

  const handleLabelChange = (index: number, label: string) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], label };
    setColumns(newColumns);
  };

  const handleColorChange = (index: number, colorClass: string) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], colorClass };
    setColumns(newColumns);
  };

  const handleBadgeMapChange = (badgeId: string, columnId: string) => {
    setBadgeMap({ ...badgeMap, [badgeId]: columnId });
  };

  const handleSave = async () => {
    // Ensure all badge IDs have a column mapping (fill missing with first column)
    const completeBadgeMap = { ...badgeMap };
    const firstColId = columns[0]?.id ?? '';
    for (const badgeId of ALL_BADGE_IDS) {
      if (!(badgeId in completeBadgeMap)) {
        completeBadgeMap[badgeId] = firstColId;
      }
    }
    const newConfig: BoardConfig = {
      columns,
      badgeToColumn: completeBadgeMap,
    };
    const validationErrors = validateBoardConfig(newConfig);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await onSave(newConfig);
    } catch {
      setErrors([t('errors.saveFailed')]);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t('config.resetConfirm'))) return;
    setSaving(true);
    try {
      await onReset();
    } catch {
      setErrors([t('errors.resetFailed')]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('config.title')}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative w-full max-w-xl bg-white dark:bg-[#263240] rounded-lg shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#253040] flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('config.title')}</h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            aria-label={t('common:button.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm space-y-1">
              {errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}

          {/* Columns section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('config.columnDefinition')}</h3>
              <button
                onClick={handleAddColumn}
                disabled={columns.length >= 10}
                className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('common:button.add')}
              </button>
            </div>

            <div className="space-y-2">
              {columns.map((col, index) => (
                <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-[#1c2129] rounded-lg">
                  {/* Color swatch selector */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenColorPicker(openColorPicker === index ? null : index)}
                      className={`w-6 h-6 rounded border-2 border-gray-300 dark:border-[#2d3a4a] ${colorSwatchClass(col.colorClass)}`}
                      aria-label={t('config.selectColor')}
                    />
                    {openColorPicker === index && (
                      <div className="absolute left-0 top-8 flex flex-wrap gap-1 p-2 bg-white dark:bg-[#263240] border border-gray-200 dark:border-[#253040] rounded-lg shadow-lg z-10 w-32">
                        {COLUMN_COLOR_PALETTE.map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              handleColorChange(index, color);
                              setOpenColorPicker(null);
                            }}
                            className={`w-5 h-5 rounded ${colorSwatchClass(color)} ${
                              col.colorClass === color ? 'ring-2 ring-blue-500' : ''
                            }`}
                            aria-label={color}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Label input */}
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) => handleLabelChange(index, e.target.value)}
                    placeholder={t('config.columnNamePlaceholder')}
                    className="flex-1 px-2 py-1 text-sm bg-white dark:bg-[#263240] border border-gray-200 dark:border-[#253040] rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                  />

                  {/* ID display */}
                  <span className="text-xs text-gray-400 font-mono w-16 truncate" title={col.id}>
                    {col.id}
                  </span>

                  {/* Move up */}
                  <button
                    onClick={() => handleMoveColumn(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={t('config.moveUp')}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>

                  {/* Move down */}
                  <button
                    onClick={() => handleMoveColumn(index, 1)}
                    disabled={index === columns.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={t('config.moveDown')}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleRemoveColumn(index)}
                    disabled={columns.length <= 1 || REQUIRED_IDS.has(col.id)}
                    className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label={t('config.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Badge-to-Column mapping section */}
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('config.badgeMapping')}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{t('config.badgeMappingHint')}</p>
            </div>
            <div className="space-y-2">
              {ALL_BADGE_IDS.map((badgeId) => {
                const badgeDef = getBadgeById(badgeId);
                if (!badgeDef) return null;
                const currentColumn = badgeMap[badgeId] ?? columns[0]?.id ?? '';
                return (
                  <div key={badgeId} className="flex items-center gap-2 px-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeDef.colorClass}`}>
                      {badgeDef.label}
                    </span>
                    <span className="text-gray-400 text-sm flex-shrink-0">&rarr;</span>
                    <select
                      value={currentColumn}
                      onChange={(e) => handleBadgeMapChange(badgeId, e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-[#263240] border border-gray-200 dark:border-[#253040] rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                    >
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.label || col.id}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-[#253040] flex-shrink-0">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            {t('config.resetDefaults')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] rounded transition-colors disabled:opacity-50"
            >
              {t('common:button.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? t('config.saving') : t('common:button.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
