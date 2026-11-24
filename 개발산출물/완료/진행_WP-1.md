# 완료 — WP-1 웹 콜라주 분위기 프로토타입

- **계획** [상용 서비스 계획](../../계획/상용_서비스_계획.md)
- **명세** [WP-1 구현 명세](../명세/WP-1-1_구현명세.md)
- **상태** 2026-11-24 웹 프로토타입 완료. Q-05·NFR-03 확정, PR #1~#3 머지. 운영 확인의 범위와 기한은 §4.3에 기록했다.
- **당회 범위** 머지 확인, main fast-forward, WP-1 확정 문서 정리 및 WP-2 세부 명세 작성.

## 1. 선행 확인

| 항목 | 실제 결과 (2026-11-23, Windows) | 근거 |
| --- | --- | --- |
| 제품 브랜치·선행 | `main`, `HEAD`·`origin/main`·원격 main 모두 `9a29e56`. 추적 변경과 비무시 untracked 없음. | `git branch --show-current`, `git rev-parse`, `git ls-remote --heads origin main`, `git status --short --untracked-files=all` |
| 작업 충돌 | 로컬 worktree 1개. GitHub 열린 PR 없음. 기존 ignored 파일·폴더 보존. | `git worktree list`, `gh pr list --state open --limit 30 --json number,headRefName,title`, `git status --short --ignored` |
| config | 로컬 config와 작업본의 규칙·계획·협업 기준 파일 10건이 줄바꿈을 제외하고 일치. 로컬 config는 저장된 추적 브랜치 대비 ahead 69/behind 25, `bin/sync-repos.win.txt`와 `dontcleanmydesk/.sync-map` 수정 상태. | `git -C (Resolve-Path ~/config).Path status --short --branch`, 로컬 정규화 본문 비교. 원격 config 동기화는 확인하지 않았다. |
| 업무 기준 | 명세 P# 선행 3항목·골디락스·시안·하네스 기준 확인. `frame.jpeg`를 열어 색과 종이 위계를 확인했다. | [문서 운영 §4·§6](../../.team_docs/문서_운영.md), [협업 설명서 §1.2](../../.team_docs/협업_시니어주니어.md), [하네스](../../.team_docs/하네스_엔지니어링_규칙.md), [레퍼런스](../../docs/references/frame.jpeg) |

## 2. 결정

| 항목 | 상태 | 결정 시점 |
| --- | --- | --- |
| 별도 웹 경로 `/collage-preview`와 기본 10개 fixture | 명세 기본값(D1·D2). 기존 앱 라우트 및 스토어와 분리된 진입점. | 명세 검토 시 |
| 양면 노트 점유율과 배경·종이 대비, 정상·예외 화면 | 확정 (2026-11-23 사용자 재정렬 결정: `1 - C` 와이드 점유 `+10%`, **무책상 후보 A 채택** — 기본 UI 단색 바탕 `#f0eeea` 위 무지 양면 노트 `#faf9f6` + **후보 B 노트 내부만 모눈 `paper=grid` 프리셋 보존**, 나무결·솔방울·나뭇잎 폐기). [무책상 시안](../시안/WP-1-1_무책상_와이어프레임_시안.html) 및 `DESIGN.md` 반영. | 완료 |
| Q-05의 밀림 강도·연쇄 여부·가장자리 감각 | 머지된 구현값 확정(D4·D5). | 2026-11-24 요구사항 §5.6·§10 및 명세 §4 동기화 |
| 게시·CI | PR #1~#3 머지, 최신 main CI 성공. | 2026-11-24 |

## 3. 구현 Step과 관문

| Step | 담당·골디락스 판정 | 입력·선행 | 결과 파일 (예정) | 증거·완료 기준 | 상태 |
| --- | --- | --- | --- | --- | --- |
| WP-1-1 — 6개 레이어와 초기 배치 | **[주니어]**. 새 격리 라우트와 순수 계산. 기존 DOM/셀렉터 변경 ① 아니오, 레거시 화면과 변경 코드 공유 ② 아니오, 기존 캐시·요청 암묵 계약 ③ 아니오. 공용 읽기 전용 유틸 재사용. 예상 7파일 / 핵심 3~4 / 430~620줄. | 명세 §0~3·§5, HTML 시안 확정. 구현 시작 시 충돌 검사. | `결과/WP-1-1_레이어_배치.md` | 브라우저 한 경로에서 6개 레이어·더미 10개·비동기 상태; W1-01~04, 4폭·다크·레이어 변형 증거. | PR #1 머지 및 검토 완료 |
| WP-1-2 — 집어 올리기·던지기·밀기 | **[시니어]**. 포인터 캡처·RAF·Matter 엔진의 수명 및 취소/재진입 경합. ① 아니오(기존 제품 화면), ② 아니오, ③ 예(입력·취소의 암묵 계약). 예상 6파일 / 핵심 4 / 400~620줄. | WP-1-1 통과 결과, 명세 §4·§5. 게시한 경우 WP-1-1 실제 머지 확인 후 main 안전 동기화. | `결과/WP-1-2_물리_상호작용.md` | 브라우저에서 끌기·던지기·정지 겹침을 재현. W1-05~07 및 W1-04 재검증. 시니어는 핵심 구현과 표적 테스트 1~2개, 주니어 4단계는 전체 회귀·결과 정리 및 승인된 PR/CI. | 완료 |
| WP-1 관문 | **사용자** 감성 확인·Q-05 확정 / **독립 검증자** 기술 관문. 구현 Step 수에 미포함. | 두 Step 결과와 실기 URL, [요구사항 §9·§10](../../docs/requirements.md), 하네스 §5 및 [문서 운영 §6](../../.team_docs/문서_운영.md#6-세션-시작과-인계). | 위 결과 연결 및 사용자 결정 후 `docs/requirements.md` §10 반영 | WP-1의 제품 관문은 사용자 실기 감성 확인. 공통 기술 관문은 별도 근거로 기록하며 S1 0건·S2 조치 또는 기한을 확인한다. | 완료 |

두 Step은 같은 화면 여정을 순서대로 제공하며 각자 브라우저에서 결과를 뚜렷하게 검증할 수 있다. 밀도·토큰·테스트를 단독 Step으로 분리하지 않는다. 상용 계획에 두 Step 완료를 반영했다.

## 4. 실행·검증 기록

### 4.1 시니어 1단계 (2026-11-23 / Windows / Codex)

- Git 읽기 명령으로 기준선·동시 작업을 확인했다. `rg --files`·`rg -n`·원문 열람으로 기존 라우트, 렌더, 테마, 스토어, 명세 기준, 실제 테스트 진입점을 대조했다. 코드 근거는 명세 P#에 있다.
- 문서 검증은 `python -X utf8 -`으로 로컬 상대 링크와 UTF-8(BOM 없음)·LF·줄 끝 공백을 확인했고, §5.1의 예시 밀도 계산 3건이 일치했다. `git diff --check`가 통과했고 `git diff --stat HEAD`와 `git status --short --untracked-files=all` 출력은 비어 있었다.
- `.gitignore:24`가 두 산출물을 무시한다. 다른 PC로 옮길 때는 승인된 config 전달 방식으로 두 파일을 전달한다. 두 파일은 제품 Git 이력에 포함되지 않는다.
- 완료 판정은 시니어 문서 작성이다. 코드 구현·화면 연결·브라우저 계측은 미실행이다. 실제 서버·DB 통합과 운영 배포는 WP-1 더미 프로토타입에 N/A. HTML 시안, 회귀, 스크린샷, Q-05 실기 및 게시·CI 결과는 이후 단계에서 기록한다.

### 4.2 주니어 2단계 (2026-11-23 / Windows / Gemini)

- `WP-1-1_시안.html` 및 `WP-1-1_무책상_와이어프레임_시안.html` 제시 후 사용자 최종 확정(**무책상 후보 A 채택**: 단색 기본 UI 바탕 `#f0eeea` 위 무지 양면 노트 `#faf9f6` + 2단 접촉 그림자 `#1f1d1b`; **후보 B 보존**: 바깥 바탕은 단색을 유지하고 양면 노트 내부만 모눈인 `?paper=grid` 속지 프리셋; 레거시 나무결·얼룩·솔방울·나뭇잎 폐기) 반영 완료.
- `DESIGN.md`, `DESIGN_REVIEW_WARM_WOOD.md`, `CLAUDE.md`, `docs/rules/frontend-design.md`, `계획/하네스_엔지니어링_규칙.md`, `docs/requirements.md`(`S-03`, `WP-1`), `개발산출물/명세/WP-1-1_구현명세.md`를 무책상 A/B 기조로 일괄 재정렬 완료.
- 명세 §2 허용 파일 7개 범위 내에서 `/collage-preview` 무책상 6개 레이어, 더미 10개(내부 7/경계 3), `?paper=plain|grid` 속지 프리셋, 로딩·빈·실패·순서 보기 구현 완료.
- 검증: `npm run typecheck`(0), `npm run lint`(0), `node --test test/design_rules.test.js test/guardrail_checklist.test.js`(9/9), 프로덕션 export(`npm run export:web`, `serve -s dist -l 8082`) W1-01~04 Playwright 14/14 통과(skip 0) 및 4폭·다크·모눈 프리셋·조명 변형 스크린샷 검토 완료.
- 발견 사항: `canvaskit.wasm`은 홈(`/`)에서 요청되지 않고 `/collage-preview` 진입 시에만 로드되나, `DeskView.tsx`와 `CollageScene.tsx`가 `@shopify/react-native-skia`를 공유해 Metro가 JS 래퍼를 `__common-*.js`로 호이스팅함(결과 파일 §2.4·§5에 시니어 검토 항목으로 기록).
- Git 처리: 이번 세션 승인 범위(로컬 작업)에 따라 커밋·push·PR 미실행. 상세 근거는 [WP-1-1 결과 파일](../결과/WP-1-1_레이어_배치.md).

### 4.3 시니어 최종 마감 (2026-11-24 / Windows / Codex)

| 구분 | 근거와 결과 |
| --- | --- |
| 구현 | [PR #1](https://github.com/choise-hun/dontcleanmydesk/pull/1)과 [PR #2](https://github.com/choise-hun/dontcleanmydesk/pull/2)의 머지 이력과 [PR #3](https://github.com/choise-hun/dontcleanmydesk/pull/3)의 `bd517c4` → `6249d5c` 머지를 확인했다. `git switch main`, `git pull --ff-only origin main`, `git merge-base --is-ancestor bd517c4 HEAD` 후 HEAD와 `origin/main`이 일치했다. [최신 main CI](https://github.com/choise-hun/dontcleanmydesk/actions/runs/45338905904) 성공. |
| 화면 연결 | 로컬 프로덕션 export의 W1-01~07(17/17, skip 0)과 사용자 실기 확인. Q-05는 공기 마찰 0.16, 반발 0, 질량 1:3.6, 던지기 19 CSS px/frame 상한, 연쇄 밀림 없음으로 확정했다. |
| 독립 관문 | [레이어 결과](../결과/WP-1-1_레이어_배치.md), [물리·성능 결과](../결과/WP-1-2_물리_상호작용.md). DEF-001~003 수정이 main에 포함됐다. DEF-004는 확정 4G 기준 cold ≤10초·warm ≤1초에 대해 기록된 8.653초·0.248초를 대조했다. DEF-005 물리 계약과 DEF-006 상태 기록은 이번 문서로 동기화했다. |
| 통합 검증 | 고정 더미와 메모리 pose만 사용하는 프로토타입으로 실제 서버·사용자 DB 연결은 해당 없음. |
| 운영 확인 | 미배포·미검증. PR #3의 nginx 캐시 리뷰는 배포 설정에서 타당하다. 웹 성능 담당이 상용 웹 배포 전 nginx 응답 헤더를 반영하고 동일 4G 조건으로 재계측한다. 그때 W1-04의 cold 진단 비교값을 10,000ms로 동기화한다. [PR 리뷰](https://github.com/choise-hun/dontcleanmydesk/pull/3#discussion_r4676196719) |

이번 마감은 앞선 실행 증거와 사용자 확인을 대조한 문서 작업이다. 브라우저 성능·전체 회귀는 재실행하지 않았다. 다음 작업은 [WP-2 진행 파일](../진행_WP-2.md)을 따른다.
