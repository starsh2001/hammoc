# G. 프롬프트 체인

**범위**: 체인 항목 관리, 순차 실행 & 재시도, 다중 탭 동기화.
**선행 도메인**: A, B, C.

---

## G1. 체인 항목 추가 · 삭제 · 재정렬 `[CORE] [DnD]`

### G-01-01: 체인 배너 추가
**절차**:
1. 채팅에 스트리밍 진행 중인 상태에서 ChatInput에 프롬프트 입력
2. "체인에 추가" 버튼 클릭
3. 2~3개 더 추가

**기대 결과**:
- `chain:add` 이벤트 전송
- PromptChainBanner에 대기 목록 표시
- 각 항목 삭제 버튼 동작

### G-01-02: 드래그로 순서 변경 `[DnD]`
**절차**:
1. 체인에 3개 항목 추가 (`A`, `B`, `C` 순)
2. HTML5 DnD 이벤트 직접 디스패치로 첫 항목을 마지막으로 이동:
   ```js
   browser_evaluate(`() => {
     const items = document.querySelectorAll('[data-testid="chain-item"]');
     const src = items[0], dst = items[items.length - 1];
     const dt = new DataTransfer();
     src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
     dst.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
     src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
     return Array.from(document.querySelectorAll('[data-testid="chain-item"]')).map(el => el.textContent);
   }`)
   ```
3. 반환 배열이 `B, C, A` 순인지 확인
4. 페이지 새로고침 후 순서 유지 확인 (서버 동기화)

**기대 결과**: 드래그 직후 로컬 UI 갱신 + 서버 상태 동기화.

> `browser_drag` MCP 툴은 pointermove 기반이라 HTML5 DnD에서 종종 실패함. `DragEvent` 직접 디스패치가 안정적.

---

## G2. 체인 순차 실행 & 재시도 `[ASYNC] [EDGE]`

### G-02-01: 자동 순차 전송
**절차**:
1. 3개 항목이 대기 중인 상태에서 현재 스트림 완료
2. 자동으로 첫 항목 전송되는 것을 관찰

**기대 결과**:
- 항목 상태 전이: pending → sending → sent
- 각 항목 간 지연 없이 순차 실행
- 모든 항목 완료 시 배너 자동 숨김

### G-02-02: 실패 시 재시도 (최대 3회)
**유도**: 서버 일시 오류 또는 네트워크 끊김.
**기대 결과**:
- 실패 감지 → 재시도 카운트 증가
- 3회 실패 시 배너에 오류 표시, 후속 항목 대기 유지
- `~/.hammoc/chain-failures/<sessionId>.json` 에 기록 (서버 파일 확인)

---

## G3. 다중 탭 동기화 `[EDGE]`

### G-03-01: 탭 A에서 추가 → 탭 B에 즉시 반영
**절차**:
1. `browser_tabs(action="new")` 로 동일 세션 두 탭 오픈
2. 탭 A에서 체인 항목 추가
3. 탭 B `browser_snapshot` → 배너 업데이트 확인

**기대 결과**: 두 탭의 체인 상태가 동일 (`chain:update` 이벤트).

### G-03-02: 세션 전환 시 체인 상태
**절차**: 체인이 대기 중인 세션에서 다른 세션으로 이동 후 복귀.
**기대 결과**: 체인 상태 유지 (세션 단위로 저장).
