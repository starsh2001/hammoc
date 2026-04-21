/**
 * useFileWatcher - Subscribe to server-broadcast file:external-change events
 * and forward them to fileStore when the event targets the currently open file.
 */

import { useEffect } from 'react';
import { getSocket } from '../services/socket';
import { useFileStore } from '../stores/fileStore';

export function useFileWatcher(): void {
  useEffect(() => {
    const socket = getSocket();

    const handler = (data: {
      projectSlug: string;
      path: string;
      type: 'modified' | 'deleted';
      mtime?: string;
    }) => {
      useFileStore.getState().notifyExternalChange(
        data.projectSlug,
        data.path,
        data.type,
        data.mtime,
      );
    };

    socket.on('file:external-change', handler);
    return () => {
      socket.off('file:external-change', handler);
    };
  }, []);
}
