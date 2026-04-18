# O. 알림

**범위**: 웹 푸시, Telegram.
**선행 도메인**: A. 외부 서비스 연결 필요.

---

## O1. 웹 푸시 알림 `[EDGE]`

### O-01-01: 권한 요청 & 활성화
**절차**:
1. Settings → Notifications → "Enable Web Push"
2. 브라우저 권한 프롬프트 → Allow

**기대 결과**:
- 서비스워커 등록 성공 (`browser_evaluate` 로 `navigator.serviceWorker` 확인)
- 테스트 알림 발송 버튼으로 알림 도착

### O-01-02: Claude 응답 완료 알림
**선행 조건**: 알림 활성, 긴 응답 유도.
**절차**: 프롬프트 전송 후 탭을 배경으로 전환.
**기대 결과**: 응답 완료 시 푸시 알림 도착.

**엣지케이스**:
- E1. 브라우저 미지원 (Safari 일부 버전): 안내 메시지
- E2. OS 알림 차단: 앱 내 상태 "비활성"으로 표시

---

## O2. Telegram 알림 `[EDGE]`

### O-02-01: 설정 & 테스트 메시지
**절차**:
1. Settings → Notifications → Telegram: 토큰/채팅ID 입력
2. "Send Test" 클릭

**기대 결과**: 해당 Telegram 채팅에 메시지 도착, 설정 저장.

### O-02-02: 권한 요청 & 응답 완료 알림
**기대 결과**: Hammoc의 권한 요청 / 응답 완료 이벤트가 Telegram으로 전송.

**엣지케이스**:
- E1. 토큰 만료 → 명확한 오류 표시
- E2. 채팅 ID 오기입 → 전송 실패 로깅
- E3. Telegram API rate limit → 재시도 or 드롭 정책 확인
