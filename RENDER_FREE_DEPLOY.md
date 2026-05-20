# Render 무료 Web Service 배포 구조

## 1. 현재 앱 구조

현재 앱은 React 정적 사이트만 있는 구조가 아닙니다.

```text
React PWA 화면
+ Node/Express API 서버
+ Google News RSS 수집 API
+ Supabase 조회/저장
+ manifest.webmanifest / service worker
```

따라서 Render에서는 **Static Site**가 아니라 **Web Service**로 배포해야 합니다.

## 2. Render 무료 배포 기본값

Render Dashboard에서 다음처럼 설정합니다.

```text
New > Web Service
Environment: Node
Instance Type: Free
Build Command: npm run install:all && npm run build
Start Command: npm start
Health Check Path: /api/health
```

`render.yaml`도 포함되어 있으므로 Blueprint 방식으로도 참고할 수 있습니다.

## 3. 환경변수

Render의 Environment 메뉴에 아래 값을 넣습니다.

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_or_service_role_key
HOST=0.0.0.0
CACHE_DAYS=30
INITIAL_DAYS=7
REGULATORY_DASHBOARD_URL=
NODE_VERSION=20.11.1
```

주의:

```text
PORT는 넣지 않습니다.
```

Render가 런타임에 `PORT`를 자동으로 제공합니다. 서버 코드는 `process.env.PORT`를 우선 사용합니다.

## 4. GitHub 업로드 전 확인

반드시 `.env` 파일은 업로드하지 않습니다.

```text
업로드 대상: 소스코드, package.json, render.yaml, docs
업로드 금지: .env, 실제 Supabase secret key
```

## 5. 배포 후 확인 주소

Render 배포 후 아래를 확인합니다.

```text
https://배포주소/api/health
https://배포주소/
https://배포주소/manifest.webmanifest
https://배포주소/sw.js
```

`/api/health`에서 아래 값이 보이면 v24 서버가 맞습니다.

```json
{"apiVersion":"v24-render-npmfix"}
```

## 6. 무료 플랜 주의사항

무료 Web Service는 사용하지 않는 동안 sleep/spin down 될 수 있습니다. 처음 접속할 때 느릴 수 있으나, 테스트·개인 사용·PWA 설치 검증에는 충분합니다.

## 7. 모바일 앱 설치 확인

온라인 배포 후 휴대폰에서 Render 주소를 열어 확인합니다.

### Android

```text
Chrome에서 배포 주소 접속
→ 설치창이 뜨면 설치
→ 안 뜨면 ⋮ 메뉴 > 앱 설치 또는 홈 화면에 추가
```

### iPhone / iPad

```text
Safari에서 배포 주소 접속
→ 공유 버튼
→ 홈 화면에 추가
```
