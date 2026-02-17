/**
 * SettingsPage Component
 * Full-page settings with sidebar nav (desktop) and accordion (mobile)
 * [Source: Story 10.1 - Task 2]
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, FolderCog, Bell, HelpCircle, Info } from 'lucide-react';
import { SettingsSection } from '../components/SettingsSection';
import { GlobalSettingsSection } from '../components/settings/GlobalSettingsSection';
import { ProjectSettingsSection } from '../components/settings/ProjectSettingsSection';

const settingsSections = [
  { id: 'global', title: '전역 설정', icon: Settings },
  { id: 'project', title: '프로젝트 설정', icon: FolderCog },
  { id: 'telegram', title: 'Telegram 알림', icon: Bell },
  { id: 'help', title: '도움말', icon: HelpCircle },
  { id: 'about', title: '만든이', icon: Info },
] as const;

type SectionId = typeof settingsSections[number]['id'];

const validTabs = settingsSections.map(s => s.id) as readonly string[];

export function SettingsPage() {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeSection: SectionId = (tab && validTabs.includes(tab)) ? tab as SectionId : 'global';

  // Mobile accordion state
  const [expandedSection, setExpandedSection] = useState<SectionId | null>(activeSection);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const toggleSection = (id: SectionId) => {
    setExpandedSection(prev => prev === id ? null : id);
  };

  const renderSectionContent = (sectionId: SectionId) => {
    switch (sectionId) {
      case 'global':
        return <GlobalSettingsSection />;
      case 'project':
        return <ProjectSettingsSection />;
      default:
        return (
          <div className="text-gray-500 dark:text-gray-400 text-sm">
            이 섹션은 준비 중입니다.
          </div>
        );
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-white dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="flex-shrink-0 sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="content-container flex items-center px-4 py-3 min-h-14">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 mr-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg
                       text-gray-700 dark:text-gray-300
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="뒤로 가기"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">설정</h1>
        </div>
      </header>

      {/* Desktop layout: sidebar + content */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <nav className="w-56 border-r border-gray-200 dark:border-gray-700 overflow-y-auto py-4 px-3">
          {settingsSections.map(section => (
            <button
              key={section.id}
              onClick={() => navigate(`/settings/${section.id}`)}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm rounded-lg transition-colors mb-1
                ${activeSection === section.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              <section.icon className="w-4 h-4" aria-hidden="true" />
              {section.title}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {settingsSections.find(s => s.id === activeSection)?.title}
          </h2>
          {renderSectionContent(activeSection)}
        </main>
      </div>

      {/* Mobile layout: accordion */}
      <div className="md:hidden flex-1 overflow-y-auto">
        {settingsSections.map(section => (
          <SettingsSection
            key={section.id}
            title={section.title}
            icon={section.icon}
            isExpanded={expandedSection === section.id}
            onToggle={() => toggleSection(section.id)}
          >
            {renderSectionContent(section.id)}
          </SettingsSection>
        ))}
      </div>
    </div>
  );
}
