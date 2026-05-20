Pharma News RSS Dashboard - local BAT 실행 안내

이번 빌드는 localhost 대신 127.0.0.1 기준으로 통일했습니다.
이전 localhost Service Worker/캐시가 빈 화면을 만들 수 있어서 run_local.bat은 reset.html을 먼저 열어 캐시를 정리합니다.

실행 순서
1. 기존 창을 모두 닫습니다.
2. stop_local.bat을 실행합니다.
3. run_local.bat을 실행합니다.
4. 브라우저는 자동으로 아래 주소를 엽니다.
   http://127.0.0.1:5190/reset.html
5. reset 후 실제 대시보드로 자동 이동합니다.

정상 확인 주소
- React 화면: http://127.0.0.1:5190
- Node API:   http://127.0.0.1:8790/api/health

로그
- run_local.log: 전체 실행 단계
- server.log: API 서버
- client.log: React/Vite 클라이언트

주의
- 예전 탭인 http://localhost:5190 은 쓰지 마십시오. 브라우저에 남은 Service Worker 영향으로 빈 화면이 재현될 수 있습니다.
- .env에 PORT=8787이 남아 있어도 start_server.bat에서 PORT=8790을 강제 적용합니다.


[v8 schemafix]
- 화면에 `column news_articles.article_summary does not exist`가 표시되던 문제는 서버 조회 컬럼과 실제 Supabase 테이블 컬럼이 달라서 발생했습니다.
- 이번 버전은 해당 컬럼이 없어도 자동으로 제외하고 다시 조회합니다.
- 완전한 신규 기능 컬럼을 쓰려면 supabase_schema.sql의 ALTER TABLE 구문을 Supabase SQL Editor에서 1회 실행하십시오.

[v10-depsfix]
- server/src/index.js no longer depends on dotenv. It loads .env with a built-in lightweight parser.
- run_local.bat/start_server.bat/start_client.bat now verify critical packages, not only node_modules folder existence.
- package-lock.json files are intentionally omitted so npm installs from the public npm registry in the user's environment.

[v11-focused-monitor]
- 키워드 인텔리전스/규제기관 정책 탭은 제거했습니다.
- 규제기관 공식자료는 상단 버튼만 남겼습니다. 나중에 .env의 REGULATORY_DASHBOARD_URL 값에 주소를 넣으면 해당 버튼으로 새 창 연결됩니다.
- RSS 수집 버튼은 Node API(/api/collect)로 1차 구현했습니다. data/rss_sources.json 검색식을 기준으로 Google News RSS를 수집해 Supabase에 upsert합니다.
- 날짜범위, 다중필터, 중요도 기준 설명, 수집범위 설명, 유사이슈 내부 링크 목록을 복원했습니다.


[v16-pwa-mobile-stage1]
- RSS 검색식 문구가 분류 근거로 들어가 일반 기사가 회수/처분으로 오분류되는 문제를 보정했습니다.
- `데일리팜 뉴스`처럼 실질 기사 제목이 아닌 잡음성 RSS 항목을 수집/표시에서 제외합니다.
- 회수·처분 모니터링 탭에서 GMP·품질위험 카드를 제거하고, 회수·판매중지/행정처분·영업정지/허가취소·품목정지만 표시합니다.
- 유사 이슈 묶음 대표 제목도 원문 링크로 열리게 했습니다.
- 전체 글자 크기와 카드 밀도를 낮췄습니다.


## v16 메모
- 전용 홈페이지 크롤러는 도입하지 않았습니다. Google News RSS + site: 검색식 기반 수집만 유지합니다.
- 제조업무정지, 영업정지, 행정처분, 회수, 판매중지, 품목정지, 허가취소 등 실제 조치성 근거가 있으면 중요도를 '높음'으로 화면 보정합니다.
- 과거 Supabase 캐시에 '회수/처분 + 중간'으로 남은 행도 조회 시 '높음'으로 정합성 보정합니다.


[v16 PWA 확인]
일반 확인은 run_local.bat을 사용합니다. PWA 설치성 확인은 run_pwa_preview.bat을 사용합니다. run_pwa_preview.bat은 React build 후 Node 서버 단일 포트 8790에서 앱을 제공합니다.


## v22 앱 설치 단순화 및 온라인화 준비 단계
- 앱 설치 버튼 클릭 시 설치 프롬프트가 없으면 진단 패널을 표시합니다.
- Manifest, Service Worker, 보안 컨텍스트, 설치 프롬프트 준비 여부를 화면에서 확인할 수 있습니다.
- 캐시 초기화 버튼으로 이전 PWA 캐시/스냅샷을 정리하고 새로고침할 수 있습니다.
