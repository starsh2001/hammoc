/**
 * ProjectTerminalPage - Remote terminal view (wrapper)
 * Story 17.3: Terminal Tab
 */

import { useParams } from 'react-router-dom';
import { TerminalTab } from '../components/terminal/TerminalTab';

export function ProjectTerminalPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  if (!projectSlug) return null;
  return <TerminalTab projectSlug={projectSlug} />;
}
