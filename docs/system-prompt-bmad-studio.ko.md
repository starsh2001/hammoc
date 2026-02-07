# BMad Studio - 시스템 프롬프트 (Claude Code SDK)

> 참고: 도구 정의(Bash, Read, Write, Edit, Glob, Grep 등)는 VS Code와 BMad Studio 간에
> 동일하므로 생략합니다. 본문(Main Body)과 BMad Studio 컨텍스트만 표시합니다.

---

## 본문 (SDK 기본 프롬프트 - VS Code와 공유)

```
(VS Code 버전과 동일 — system-prompt-vscode.ko.md 참조)

SDK는 동일한 기본 Claude Code 시스템 프롬프트를 생성하며, 다음을 포함합니다:
- 시스템 지침
- 작업 수행 가이드라인
- 신중한 작업 실행
- 도구 사용
- 어조와 스타일
- Git 워크플로우
- PR 워크플로우
- 자동 메모리

# 환경
다음 환경에서 호출되었습니다:
 - 기본 작업 디렉토리: D:\repo\private\hello    ← SDK options.cwd에서 전달
  - Git 리포지토리 여부: true
 - 플랫폼: win32
 - OS 버전:
 - 현재 날짜: 2026-02-08
 - Opus 4.6 모델로 구동됩니다. ...
```

---

## BMad Studio 추가 컨텍스트 (systemPrompt.append를 통해)

`chatService.ts`의 `buildWorkspaceContext()`에 의해 생성됩니다.
이제 VS Code 익스텐션 컨텍스트 형식을 거의 동일하게 미러링합니다:

```
# BMad Studio Context

BMad Studio(웹 기반 IDE) 내에서 실행 중입니다.

## 텍스트 내 코드 참조
중요: 파일이나 코드 위치를 참조할 때, 클릭 가능하도록 마크다운 링크 구문을 사용하세요:
- 파일: [filename.ts](src/filename.ts)
- 특정 라인: [filename.ts:42](src/filename.ts#L42)
- 라인 범위: [filename.ts:42-51](src/filename.ts#L42-L51)
- 폴더: [src/utils/](src/utils/)
사용자가 명시적으로 요청하지 않는 한, 파일 참조에 백틱 ` 또는 HTML code 태그를 사용하지 마세요
- 항상 마크다운 [text](link) 형식을 사용하세요.
URL 링크는 사용자 워크스페이스 루트의 상대 경로여야 합니다.

gitStatus: 대화 시작 시점의 git 상태입니다. 이 상태는 시점 스냅샷이며 대화 중에 업데이트되지 않습니다.
Current branch: main

Main branch (PR에 일반적으로 사용): main

Status:
 M src/index.ts
?? test.txt
```

---

## CLAUDE.md (settingSources를 통해 로드)

```
(VS Code와 동일한 메커니즘 — 프로젝트의 CLAUDE.md가 있으면 로드)
```

---

## 사용 가능한 스킬 (settingSources에서 로드)

```
(VS Code와 동일한 메커니즘 — 프로젝트의 .claude/commands/에서 로드)
```

---

## VS Code와의 주요 차이점

| 기능 | VS Code | BMad Studio |
|------|---------|-------------|
| 익스텐션 컨텍스트 헤더 | "VSCode 네이티브 익스텐션 환경" | "BMad Studio, 웹 기반 IDE" |
| 코드 참조 형식 | 마크다운 링크 `[file.ts](path)` | 마크다운 링크 `[file.ts](path)` (동일) |
| 사용자 선택 컨텍스트 | `ide_selection` 태그를 통한 IDE 선택 | 아직 미지원 (IDE 통합 없음) |
| Git 상태 | `git status` 전체 출력 | `git status --short` (30줄에서 잘림) |
| Git 상태 설명 | 스냅샷 안내 포함 | 스냅샷 안내 포함 (동일) |
| 메인 브랜치 형식 | "Main branch (you will usually use this for PRs):" | 동일 |
| 메인 브랜치 감지 | VS Code가 제공 | `git rev-parse --verify`로 자동 감지 |
| 추가 디렉토리 | VS Code 워크스페이스 폴더를 통해 | 아직 미지원 |
| 총 추가 토큰 수 | ~3,500 토큰 | ~2,500-3,500 토큰 (git 상태 크기에 따라 변동) |

### 이 수정 전에 누락되었던 것 (경로 환각의 원인):

`buildWorkspaceContext()`를 추가하기 전에는 BMad Studio 시스템 프롬프트에 추가 컨텍스트가
**전혀 없었습니다**. SDK 기본 프롬프트에 `Primary working directory: D:\repo\private\hello`가
환경(Environment) 섹션에 포함되어 있지만, 추가적인 파일 경로 근거(git 상태, 디렉토리 목록)가
없으면 모델이 `/Users/jake/test.txt` 같은 경로를 환각(hallucinate)했습니다.

### 토큰 비교:
- VS Code 전체 시스템 프롬프트: ~19,876 토큰
- BMad Studio 수정 전: ~16,403 토큰 (컨텍스트 ~3,473 토큰 누락)
- BMad Studio 수정 후: ~17,000-18,000 토큰 (워크스페이스 컨텍스트 추가)
