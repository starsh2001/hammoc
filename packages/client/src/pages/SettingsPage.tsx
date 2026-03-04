/**
 * SettingsPage Component
 * Full-page settings with sidebar nav (desktop) and accordion (mobile)
 * [Source: Story 10.1 - Task 2]
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Settings, FolderCog, Bell, Wrench, HelpCircle, Info } from 'lucide-react';
import { LayoutToggleButton } from '../components/LayoutToggleButton';
import { SettingsSection } from '../components/SettingsSection';
import { GlobalSettingsSection } from '../components/settings/GlobalSettingsSection';
import { ProjectSettingsSection } from '../components/settings/ProjectSettingsSection';
import { TelegramSettingsSection } from '../components/settings/TelegramSettingsSection';
import { HelpSection } from '../components/settings/HelpSection';
import { AboutSection } from '../components/settings/AboutSection';
import { AdvancedSettingsSection } from '../components/settings/AdvancedSettingsSection';

const sectionDefs = [
  { id: 'global', titleKey: 'tabs.global', icon: Settings },
  { id: 'project', titleKey: 'tabs.project', icon: FolderCog },
  { id: 'telegram', titleKey: 'tabs.telegram', icon: Bell },
  { id: 'advanced', titleKey: 'tabs.advanced', icon: Wrench },
  { id: 'help', titleKey: 'tabs.help', icon: HelpCircle },
  { id: 'about', titleKey: 'tabs.about', icon: Info },
] as const;

type SectionId = typeof sectionDefs[number]['id'];

const validTabs = sectionDefs.map(s => s.id) as readonly string[];

export function SettingsPage() {
  const { t } = useTranslation('settings');
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
      case 'telegram':
        return <TelegramSettingsSection />;
      case 'advanced':
        return <AdvancedSettingsSection />;
      case 'help':
        return <HelpSection />;
      case 'about':
        return <AboutSection />;
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
            aria-label={t('page.backAriaLabel')}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">{t('page.title')}</h1>
          <LayoutToggleButton className="hidden sm:block" />
        </div>
      </header>

      {/* Desktop layout: sidebar + content */}
      <div className="content-container hidden md:flex flex-1 overflow-hidden w-full">
        <nav className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto py-4 px-3">
          {sectionDefs.map(section => (
            <button
              key={section.id}
              onClick={() => navigate(`/settings/${section.id}`)}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm rounded-lg transition-colors mb-1
                ${activeSection === section.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
            >
              <section.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{t(section.titleKey)}</span>
            </button>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {t(sectionDefs.find(s => s.id === activeSection)!.titleKey)}
          </h2>
          {renderSectionContent(activeSection)}
        </main>
      </div>

      {/* Mobile layout: accordion */}
      <div className="content-container md:hidden flex-1 overflow-y-auto">
        {sectionDefs.map(section => (
          <SettingsSection
            key={section.id}
            title={t(section.titleKey)}
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
