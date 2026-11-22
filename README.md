# 어질러진 방 (dontcleanmydesk)

아이디어(글·사진·음악·영상·링크)를 빠르게 저장하고, 어질러진 책상처럼 펼쳐 보며 영감을 얻는 아이디어 수집 앱.

현재 `app/`과 `server/`에는 개발 초안(2026-10-14) 기반 웹 우선 프로토타입이 구현되어 있으며, [`docs/requirements.md`](docs/requirements.md)에 `Book`·`CollageState` 기반 **아이디어 콜라주 노트 앱**(`P1`~`P8`)으로 재정의한 최신 요구사항이 정리되어 있다.

```
app/                Expo(React Native) + Expo Router — 웹·모바일 공용 클라이언트
server/             Kotlin(Ktor) — 링크 메타데이터, 이미지 프록시, 계정·동기화, 파일 업로드
docs/               요구사항 정의서(requirements.md) 및 UI 레퍼런스(references/frame.jpeg)
docker-compose.yml  server(8787) + web(8081) 컨테이너 실행 구성
.github/workflows/  GitHub Actions CI (app: typecheck·lint·test·export, server: gradle build)
```

## 실행

```bash
# 서버 (기본 포트 8787, 데이터는 server/data/)
cd server
./gradlew run            # Windows: gradlew.bat run

# 웹 앱
cd app
npm install
npm run web              # http://localhost:8081
```

Docker Compose로 한 번에 띄울 수도 있다.

```bash
docker compose up --build
```

서버 없이도 앱은 동작한다(로컬 저장, 절차적 썸네일). 서버가 있으면 링크 썸네일·제목과 동기화가 붙는다.
앱이 보는 서버 주소는 `EXPO_PUBLIC_API_URL`(기본 `http://localhost:8787`)이다.

### 서버 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | H2 파일(`./data/messy-room`, PostgreSQL 모드) | PostgreSQL 은 `jdbc:postgresql://…` |
| `FILES_DIR` | `./data/files` | 미디어 원본·썸네일 (S3 는 `FileStorage` 구현 추가) |
| `CORS_ORIGINS` | `*` | 쉼표 구분, 예: `https://room.example.com` |
| `ALLOW_PRIVATE_FETCH` | `false` | 내부망 URL 가져오기 허용 (개발용) |

사내망처럼 TLS 를 검사하는 프록시 뒤에서는 JVM 이 외부 HTTPS 를 신뢰하지 못해 링크 미리보기가 실패한다.
Windows 라면 `JAVA_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` 로 OS 인증서 저장소를 쓰게 한다.

## 검사

```bash
cd app && npm run typecheck && npm run lint && npm test     # 타입체크·린트·단위 테스트
cd server && ./gradlew test                                  # 동기화 LWW, 인증, 파일, SSRF 차단, OG 파싱
```

## 구조 한눈에

- `app/src/core/room.ts` — 어질러진 방 규칙(밀도 제한, 가중치 랜덤, 상태 유지, 자연 순환, 뒤지기, 침입자). 순수 로직.
- `app/src/desk/` — Skia 책상. 레이어 1~3과 5~6은 한 번 구워 이미지로 쓰고, 매 프레임엔 카드(구김 셰이더 + 따뜻한 그림자)와 나뭇잎 흔들림만 그린다. 웹에서는 이 화면에 들어올 때 CanvasKit 을 지연 로딩한다.
- `app/src/collect/` — 첫 화면(입력 + matter.js 통), 드래그 앤 드롭·붙여넣기·클립보드 링크 제안, 북마클릿·PWA 공유 대상 수신.
- `app/src/thumbs/` — 썸네일 파이프라인(og:image → oEmbed → 영상 프레임 / ID3 커버 → 파형 → 절차적).
- `app/src/themes/` — 테마 매니페스트. 기본 `오후 햇살`, 변형 `아침`·`밤`.
- `app/src/store/` — 로컬 우선 저장(웹 IndexedDB, 모바일 expo-sqlite + 파일), `sync/` 는 서버와 LWW 동기화.
- `server/src/main/kotlin/desk/room/` — Ktor 서버(`Application.kt`, `SyncStore.kt`, `LinkMeta.kt`, `SafeHttp.kt`, `FileStorage.kt`).
- `docs/requirements.md` — 아이디어 콜라주 노트 앱 요구사항 정의서(`P1`~`P8` 단계별 범위, 용어·데이터·API 계약).

## 현재 상태 및 다음 단계

- **구현 상태:** `app/`·`server/`는 초안(`어질러진 방`: `Bin`/`RoomState`/`/api/*`) 기준 웹 프로토타입 상태다. 모바일 코드 경로는 타입체크만 통과했고 기기에서 돌려 보지 않았다.
- **리뉴얼 계획:** `docs/requirements.md`에 따라 `WP-1`(콜라주 분위기 프로토타입)부터 단계적으로 재구성할 예정이다.
- **미구현 확장 항목:** 모바일 공유 시트·위젯·네이티브 미디어, 생성형 썸네일, 임베딩 추천, 테마 팩 스토어, 8자리 연결 코드 만료·재발급·무차별 대입 제한.
