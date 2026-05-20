# Implementation stage - v22-install-simple-onlineprep

v20은 v19의 PWA/mobile 구조를 유지하면서 PC Dashboard의 카테고리 분포 카드 시각 밀도를 조정한 버전입니다.

- 카테고리 분포 막대 두께 확대
- 행 간격 확대
- PC 카드 하단 공백 감소
- 모바일 접힘/표시 구조 유지

# Implementation stage - v19-pwa-install-mobile-fold

## 현재 단계

v19은 분류/이슈 품질 보정을 잠시 병행 개선 대상으로 두고, PWA 구현 단계로 진입한 첫 버전입니다.

## 반영 범위

- 모바일 화면 대응 1차
  - 하단 고정 탭바
  - 카드/필터/뉴스목록 모바일 폭 대응
  - safe-area 대응
- PWA 설치 기반
  - manifest 보강
  - 192/512 PNG 아이콘 및 maskable 아이콘 추가
  - apple-touch-icon 및 mobile-web-app 메타 추가
  - beforeinstallprompt 기반 설치 버튼 추가
- Service Worker 재정리
  - app shell 캐시 v19
  - API 응답은 Service Worker에서 캐시하지 않음
  - 새 버전 감지 시 앱 내 새로고침 적용 버튼 표시
  - 오프라인 fallback 페이지 추가
- 오프라인/연결 실패 보완
  - 마지막 성공 조회 결과를 localStorage 스냅샷으로 보관
  - API 연결 실패 시 최근 스냅샷 표시
- PWA 미리보기 BAT 추가
  - run_pwa_preview.bat: React build 후 Node 서버 8790 단일 포트로 앱 제공

## 실행 구분

### 일반 로컬 개발 확인

run_local.bat

- React dev server: http://127.0.0.1:5190
- Node API: http://127.0.0.1:8790
- Service Worker는 개발 중 캐시 꼬임 방지를 위해 해제됩니다.

### PWA 설치성 확인

run_pwa_preview.bat

- React build 수행
- Node API 서버가 client/dist 정적 파일까지 함께 제공
- 접속 주소: http://127.0.0.1:8790
- Chrome/Edge의 앱 설치 메뉴 또는 설치 버튼 동작 확인

## 아직 남은 PWA 과제

- 실제 모바일 기기 접속 테스트
- 설치 후 아이콘/앱명/주소창 제거 여부 확인
- 배포 환경 HTTPS 기준 테스트
- 오프라인 스냅샷 표시 범위와 경고 문구 조정
- 캐시 업데이트 정책 장기 안정화


## v22 앱 설치 단순화 및 온라인화 준비 단계
- 앱 설치 버튼 클릭 시 설치 프롬프트가 없으면 진단 패널을 표시합니다.
- Manifest, Service Worker, 보안 컨텍스트, 설치 프롬프트 준비 여부를 화면에서 확인할 수 있습니다.
- 캐시 초기화 버튼으로 이전 PWA 캐시/스냅샷을 정리하고 새로고침할 수 있습니다.
