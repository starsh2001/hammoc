/**
 * ProjectQueuePage - Queue editor and runner view
 * [Source: Story 15.3 - Task 6]
 */

import { useParams } from 'react-router-dom';
import { QueueEditor } from '../components/queue/QueueEditor';

export function ProjectQueuePage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  if (!projectSlug) return null;
  return <QueueEditor projectSlug={projectSlug} />;
}
