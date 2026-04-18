# 키보드 단축키 매트릭스 (Appendix)

> 출처: [docs/MANUAL.md §13](../../docs/MANUAL.md)
> 검증 시 `browser_press_key` 로 호출. Windows/Linux 기준 표기. macOS 는 Ctrl → Cmd 치환.

---

## Chat 영역

| 단축키 | 동작 | 관련 시나리오 |
|---|---|---|
| `Enter` | 메시지 전송 (Desktop) | F-01-01 |
| `Shift+Enter` | 줄바꿈 | F-01-01 |
| `Esc` | 생성 중단 | C-07-01 |
| `Ctrl+C` | 중단 (텍스트 미선택 시) / 복사 (선택 시) | C-07-02 |
| `↑` / `↓` | 프롬프트 히스토리 네비게이션 | — |
| `/` | 슬래시 명령 팔레트 | F-03-01 |
| `*` | 스타 명령 팔레트 | F-03-03 |
| `%` | 스니펫 팔레트 | F-04-01 |
| `Shift+Tab` | 권한 모드 순환 | D-02-01 |

## 메시지 편집

| 단축키 | 동작 | 관련 |
|---|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | 편집된 메시지 전송 | C-03-01 |

## Quick Panel (input/textarea 비포커스 상태에서만)

| 단축키 | 동작 | 관련 |
|---|---|---|
| `Alt+1` | Sessions 패널 토글 | M-01-01 |
| `Alt+2` | Files 패널 토글 | M-01-01 |
| `Alt+3` | Git 패널 토글 | M-01-01 |
| `Alt+4` | Terminal 패널 토글 | M-01-01 |

## Editor (CodeMirror)

| 단축키 | 동작 | 관련 |
|---|---|---|
| `Ctrl+S` / `Cmd+S` | 파일 저장 | J-02-01 |
| `Ctrl+F` | 찾기 | S-03-03 |
| `Ctrl+H` | 바꾸기 | S-03-03 |

## Diff Viewer

| 단축키 | 동작 | 관련 |
|---|---|---|
| `F7` | 다음 변경 | S-04-01 |
| `Shift+F7` | 이전 변경 | S-04-01 |

## Terminal

| 단축키 | 동작 | 관련 |
|---|---|---|
| `Ctrl++` / `Ctrl+=` | 폰트 크기 증가 | L-01-03 |
| `Ctrl+-` | 폰트 크기 감소 | L-01-03 |
| `Ctrl+0` | 폰트 크기 초기화 | L-01-03 |

## Queue Runner

| 단축키 | 동작 | 관련 |
|---|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | 큐 실행 시작 | H-02-01 |

---

## 단축키 회귀 테스트 체크리스트

SDK 업데이트 또는 UI 리팩터링 후 아래를 일괄 점검:

- [ ] Chat — Enter/Shift+Enter/ESC/Ctrl+C/Shift+Tab
- [ ] 팔레트 — `/`, `*`, `%` 모두 팔레트 오픈 동작
- [ ] Quick Panel — Alt+1~4 (textarea 포커스 여부별 동작 구분 확인)
- [ ] Editor — Ctrl+S 저장, 미저장 플래그
- [ ] Diff — F7 / Shift+F7 네비게이션
- [ ] Terminal — 폰트 단축키 3종
- [ ] Queue — Ctrl+Enter 실행

**실패 판단 기준**: 단축키 눌렀는데 동작 안 함 / 다른 동작이 수행됨 / 콘솔 에러.
