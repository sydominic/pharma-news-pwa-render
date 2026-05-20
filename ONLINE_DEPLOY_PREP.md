# 온라인 배포 준비 - Render 무료 Web Service 기준

## 1. 이번 버전 기준

- 버전: `v24-render-npmfix`
- 배포 추천 방식: Render **Web Service** 무료 플랜
- 이유: 현재 앱은 React 정적 파일뿐 아니라 Node/Express API와 RSS 수집 API를 함께 사용합니다.

## 2. 배포 명령

Render Web Service 설정값:

```text
Build Command: npm run install:all && npm run build
Start Command: npm start
Health Check Path: /api/health
```

루트 `package.json`에는 다음 스크립트가 있습니다.

```text
install:all = server/client 패키지 설치
build       = React build 생성
start       = Node/Express 서버 실행
```

## 3. Render 환경변수

필수:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_or_service_role_key
```

권장:

```env
HOST=0.0.0.0
CACHE_DAYS=30
INITIAL_DAYS=7
REGULATORY_DASHBOARD_URL=
NODE_VERSION=20.11.1
```

주의:

```text
PORT는 Render가 자동으로 주입하므로 직접 넣지 않습니다.
```

## 4. 배포 후 확인

```text
https://배포주소/api/health
https://배포주소/
https://배포주소/manifest.webmanifest
https://배포주소/sw.js
```

`/api/health`에서 아래 값이 보이면 정상입니다.

```json
{"apiVersion":"v24-render-npmfix"}
```

## 5. PWA 설치 확인

PWA 설치는 온라인 HTTPS 주소에서 확인하는 것이 가장 정확합니다.

### Android

```text
Chrome에서 배포 주소 접속
→ 설치창이 뜨면 설치
→ 안 뜨면 우측 상단 ⋮ 메뉴 > 앱 설치 또는 홈 화면에 추가
```

### iPhone / iPad

```text
Safari에서 배포 주소 접속
→ 공유 버튼
→ 홈 화면에 추가
```

## 6. 무료 플랜 사용 시 주의

Render 무료 Web Service는 일정 시간 요청이 없으면 sleep/spin down 상태가 될 수 있습니다. 처음 접속할 때 느릴 수 있으나, 속도 지연을 감수하는 테스트·개인 사용 단계에는 적합합니다.

## 7. GitHub 업로드 금지 항목

```text
.env
실제 Supabase secret/service key
개인 계정 토큰
```

`.env.render.example`은 예시 파일이므로 업로드해도 됩니다.
