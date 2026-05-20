[PWA 미리보기 실행]

일반 기능 확인: run_local.bat
- React dev server: 127.0.0.1:5190
- Node API: 127.0.0.1:8790
- 개발 중 Service Worker는 자동 해제됩니다.

PWA 설치성 확인: run_pwa_preview.bat
- React build 후 Node 서버가 정적 파일까지 같이 제공합니다.
- 접속 주소: http://127.0.0.1:8790
- Chrome/Edge 주소창 또는 메뉴에서 앱 설치 가능 여부를 확인합니다.
- 로컬 개발 모드와 달리 manifest/service worker가 동작합니다.


## v22 앱 설치 단순화 및 온라인화 준비 단계
- 앱 설치 버튼 클릭 시 설치 프롬프트가 없으면 진단 패널을 표시합니다.
- Manifest, Service Worker, 보안 컨텍스트, 설치 프롬프트 준비 여부를 화면에서 확인할 수 있습니다.
- 캐시 초기화 버튼으로 이전 PWA 캐시/스냅샷을 정리하고 새로고침할 수 있습니다.
