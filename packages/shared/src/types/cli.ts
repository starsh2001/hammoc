/**
 * CLI 상태 정보
 * @description Claude CLI의 설치 및 인증 상태를 나타냄
 */
export interface CLIStatus {
  cliInstalled: boolean;
  authenticated: boolean;
  apiKeySet: boolean;
  setupCommands: {
    install: string; // CLI 설치 명령어
    login: string; // 로그인 안내
    apiKey: string; // API 키 설정 방법
  };
}

/**
 * CLI 상태 API 응답
 * @description /api/cli-status 엔드포인트의 응답 형식
 * - 정상: CLIStatus 필드만 포함
 * - 에러: error 필드 추가 (CLI 실행 실패 시)
 */
export interface CLIStatusResponse extends CLIStatus {
  /** CLI 실행 실패 시에만 포함되는 에러 메시지 */
  error?: string;
}

/**
 * 기본 setupCommands 상수
 * @description 클라이언트에서 표시할 설정 안내 명령어
 */
export const DEFAULT_SETUP_COMMANDS = {
  install: 'npm install -g @anthropic-ai/claude-code',
  login: 'claude (then type /login in interactive mode)',
  apiKey: 'export ANTHROPIC_API_KEY=<your-api-key>',
} as const;
