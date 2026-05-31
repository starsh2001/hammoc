/**
 * Story 31.1: path-array key widget (4 keys: customTechnicalDocuments,
 * devLoadAlwaysFiles, brownfieldEpic.updateOnCreate, brownfieldEpic.doNotUpdate).
 * Drag-to-reorder via `@hello-pangea/dnd` (QueueRunnerPanel pattern) + add /
 * remove. `customTechnicalDocuments` is `null` on disk until the first item is
 * added, at which point it is promoted to an array. Array mutations save
 * immediately (AC2.b). `brownfieldEpic.doNotUpdate` items carry a pattern-hint
 * tooltip.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical, Plus, X } from 'lucide-react';
import {
  useBmadCoreConfigStore,
  getAtPath,
  type BmadKeyDef,
} from '../../../../stores/bmadCoreConfigStore';

interface Item {
  id: string;
  value: string;
}

let uidCounter = 0;
function toItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => ({ id: `bmaditem-${uidCounter++}`, value: String(v) }));
}

export function BmadArrayWidget({ keyDef }: { keyDef: BmadKeyDef }) {
  const { t } = useTranslation('settings');
  const value = useBmadCoreConfigStore((s) => getAtPath(s.knownKeys, keyDef.path));
  const patchKey = useBmadCoreConfigStore((s) => s.patchKey);
  const [items, setItems] = useState<Item[]>(() => toItems(value));

  // Re-seed from the store value only when it changes by content (reload /
  // external change) — not on our own optimistic updates, which already match.
  useEffect(() => {
    const current = items.map((i) => i.value);
    const incoming = Array.isArray(value) ? value.map((v) => String(v)) : [];
    if (current.length !== incoming.length || current.some((v, i) => v !== incoming[i])) {
      setItems(toItems(value));
    }
    // Intentionally depends only on `value` — re-seed when the store value
    // changes externally (reload), not on local `items` edits (would loop).
  }, [value]);

  const commit = (next: Item[]) => {
    setItems(next);
    // null-promotion is implicit: an empty array writes `[]`, a populated one
    // writes the list. (customTechnicalDocuments: null → [] on first add.)
    patchKey(keyDef.path, next.map((i) => i.value));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    commit(next);
  };

  const isDoNotUpdate = keyDef.id === 'brownfieldEpic.doNotUpdate';

  return (
    <div className="py-1.5" data-testid={`bmad-key-${keyDef.id}`}>
      <label className="block text-sm font-medium text-gray-200">
        {t(`harness.bmad.keys.${keyDef.id}.label`)}
      </label>
      <p className="mt-0.5 mb-1 text-xs text-gray-500">
        {t(`harness.bmad.keys.${keyDef.id}.description`)}
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`bmad-array-${keyDef.id}`}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-1">
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-1 py-0.5"
                      title={isDoNotUpdate ? t('harness.bmad.widgets.array.patternHint') : undefined}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        className="shrink-0 cursor-grab text-gray-500"
                        aria-label={t('harness.bmad.widgets.array.dragToReorder')}
                      >
                        <GripVertical size={14} />
                      </span>
                      <input
                        type="text"
                        className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm text-gray-100 focus:outline-none"
                        value={item.value}
                        onChange={(e) => {
                          const next = items.map((it) => (it.id === item.id ? { ...it, value: e.target.value } : it));
                          commit(next);
                        }}
                        data-testid={`bmad-array-input-${keyDef.id}-${index}`}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-red-400"
                        onClick={() => commit(items.filter((it) => it.id !== item.id))}
                        aria-label={t('harness.bmad.widgets.array.remove')}
                        data-testid={`bmad-array-remove-${keyDef.id}-${index}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <button
        type="button"
        className="mt-1 flex items-center gap-1 rounded border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700"
        onClick={() => commit([...items, { id: `bmaditem-${uidCounter++}`, value: '' }])}
        data-testid={`bmad-array-add-${keyDef.id}`}
      >
        <Plus size={14} />
        {t('harness.bmad.widgets.array.add')}
      </button>
    </div>
  );
}
