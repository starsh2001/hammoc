/**
 * HelpSection - Usage guide for SettingsPage
 * [Source: Story 10.5 - Task 1]
 */

import type { ReactNode } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { key: 'Enter', description: '메시지 전송 (데스크톱)' },
  { key: 'Shift+Enter', description: '줄바꿈 (데스크톱)' },
  { key: 'Escape', description: '스트리밍 중단 / 팝업 닫기' },
  { key: `${modKey}+C`, description: '스트리밍 중단 (텍스트 미선택 시)' },
  { key: 'F7 / Shift+F7', description: 'Diff 뷰어 변경점 탐색 (다음/이전)' },
  { key: '/', description: '슬래시 커맨드 팔레트 열기' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200">
      {children}
    </kbd>
  );
}

function GuideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function HelpSection() {
  return (
    <div className="space-y-6">
      {/* Basic chat usage */}
      <GuideCard title="기본 채팅 사용법">
        <GuideList
          items={[
            '채팅 입력창에 메시지를 입력하고 Enter(데스크톱) 또는 전송 버튼(모바일)으로 전송',
            '이미지 첨부: 클립 아이콘 또는 붙여넣기(Ctrl+V)로 이미지 업로드 가능',
            '새 세션: 헤더의 "+" 버튼으로 새 채팅 세션 시작',
            '세션 전환: 시계 아이콘으로 이전 대화 세션에 접근',
          ]}
        />
      </GuideCard>

      {/* Slash commands */}
      <GuideCard title="슬래시 커맨드">
        <GuideList
          items={[
            '채팅 입력창에 /를 입력하면 사용 가능한 명령어 목록이 표시됨',
            '프로젝트에 설정된 커맨드 중 자주 사용하는 것은 ★ 즐겨찾기로 등록 가능',
            '즐겨찾기 등록: 커맨드 팔레트에서 ★ 클릭 또는 길게 누르기',
            '등록된 즐겨찾기는 입력창 상단에 빠른 접근 버튼으로 표시됨',
          ]}
        />
      </GuideCard>

      {/* Permission Mode */}
      <GuideCard title="Permission Mode">
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li><strong className="text-gray-900 dark:text-white">Plan</strong>: 코드 변경 전 계획을 먼저 제안합니다</li>
          <li><strong className="text-gray-900 dark:text-white">Ask before edits (기본)</strong>: 파일 수정 전 항상 확인을 요청합니다</li>
          <li><strong className="text-gray-900 dark:text-white">Edit Automatically</strong>: 파일 수정을 자동으로 수행합니다</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          설정 &gt; 전역 설정 또는 프로젝트 설정에서 기본 Permission Mode를 변경할 수 있습니다.
        </p>
      </GuideCard>

      {/* BMad Method */}
      <GuideCard title="BMad Method 연동">
        <GuideList
          items={[
            'BMad Method는 AI 기반 개발 워크플로우 프레임워크입니다',
            '프로젝트 페이지에서 "BMad 설정" 버튼으로 프로젝트에 BMad Core를 설치할 수 있습니다',
            '설치 후 BMad 에이전트 버튼(채팅 화면 우측 하단)에서 전문 에이전트를 빠르게 호출할 수 있습니다',
            '에이전트: SM(스크럼 마스터), PM(프로젝트 매니저), Dev(개발자), QA(품질 보증) 등',
          ]}
        />
      </GuideCard>

      {/* Keyboard shortcuts */}
      <GuideCard title="키보드 단축키">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 text-gray-900 dark:text-white font-medium">단축키</th>
                <th className="text-left py-2 text-gray-900 dark:text-white font-medium">기능</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              {SHORTCUTS.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 pr-4">
                    <Kbd>{s.key}</Kbd>
                  </td>
                  <td className="py-2">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideCard>
    </div>
  );
}
