/**
 * Build the X-Hammoc-Socket-Id header for settings mutations.
 *
 * The server uses this id to exclude the originating browser from the
 * multi-device settings broadcast, so a client never receives an echo of its
 * own change. Best-effort: if the socket isn't connected yet the header is
 * omitted and the change simply broadcasts to everyone (harmless — the origin
 * already applied it optimistically).
 */
import { getSocket } from '../socket';

export function socketIdHeader(): Record<string, string> {
  try {
    const id = getSocket().id;
    return id ? { 'X-Hammoc-Socket-Id': id } : {};
  } catch {
    return {};
  }
}
