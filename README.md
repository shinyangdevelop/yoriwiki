# 요리위키

- `backend/`: Express API, SQLite DB (`backend/database.db`)
- `frontend/`: SvelteKit 화면 및 `/api/*` 프록시
- `dev.mjs`: 두 개발 서버 동시 실행 및 종료

Node.js 22.12 이상(또는 24 LTS)을 사용합니다. 루트에서 최초 한 번:

```powershell
npm run setup
```

이후 루트에서 실행:

```powershell
npm run dev
```

직접 `node dev.mjs`로 실행해도 됩니다. 화면은 http://127.0.0.1:5173,
backend는 http://127.0.0.1:8080 입니다. Ctrl+C로 둘을 종료합니다.
한쪽 서버가 종료되면 다른 서버도 종료합니다. 사용 중인 frontend 포트는 자동 변경하지 않습니다.
PowerShell에서 `$env:PORT='8081'`, `$env:FRONTEND_PORT='5174'`로 포트를 바꿀 수 있습니다.
실행 위치와 무관하게 각 폴더를 작업 디렉토리로 사용하며 DB도 backend 내부 파일을 사용합니다.

브라우저 → SvelteKit `/api/food` → Express `/food` → SQLite 순서로 연결됩니다.
기존 backend API 경로는 유지합니다. `frontend/src/lib/api.ts`에 공통 호출 함수가 있습니다.
`/recipes` 목록과 `/recipes/[id]` 상세는 실제 DB를 조회하며, 빈 DB와 연결 실패를 표시합니다.
레시피 등록 폼, 커뮤니티 등 기존 시안 기능은 별도 구현 대상입니다.
더미 데이터는 이 작업에서 생성하지 않습니다. [데이터 명세](docs/search-dummy-data.md)를 참고하세요.

frontend만 별도로 실행할 때는 `frontend/.env.example`을 `.env`로 복사하고
`BACKEND_URL`을 설정하세요. 통합 스크립트는 해당 값을 환경 변수로 전달합니다.
프록시는 SvelteKit 서버 라우트이므로 개발 전용 Vite 프록시에 의존하지 않습니다.
배포 시에도 SvelteKit 서버 실행이 가능한 adapter와 서버에서 접근 가능한 `BACKEND_URL`이 필요합니다.

검증: `npm run check`, `npm run build`.

## 요리 탐색

홈 검색창과 `/search`, `/recipes`에서 실제 DB의 이름·별칭·재료·본문을 검색할 수 있습니다.
분류·시간·난이도 필터, 정렬, 페이지 이동을 지원합니다. [검색과 DB 그래프 연결 설명](docs/search.md)을 참고하세요.

상단 ‘탐색’ 또는 `/search`에서 넓이 확장량과 그리디로 요리를 추천합니다.
`/profile`에서는 축을 선택하고 경험 영역과 영역 안의 미경험 요리를 확인합니다.
‘해본 요리’는 계정에 저장하며 지도와 추천은 브라우저에서 계산합니다.
추후 데이터의 필수 필드와 계산 과정은 [탐색 알고리즘 설명](docs/exploration-algorithms.md)에 정리했습니다.
알고리즘 테스트는 `npm run test:explore`로 실행합니다.

## 회원가입과 로그인

`/signup`에서 이메일 중복 확인, 닉네임·비밀번호·비밀번호 확인 및 필수 약관 동의를
검증하고 계정을 저장합니다. 중복 확인은 참고용이며 최종 가입 시 DB UNIQUE 제약으로
이메일·닉네임 중복을 다시 방지합니다. 이메일은 앞뒤 공백 제거 및 소문자로 통일합니다.
가입 성공 후 로그인 화면으로 이동합니다.

비밀번호는 무작위 salt와 Node.js scrypt로 해시하고 원문을 저장하거나 로그에 출력하지 않습니다.
약관별 동의 시각을 저장합니다. 로그인은 HttpOnly / SameSite=Lax 쿠키와 DB 세션을 사용하며,
서버에는 세션 토큰의 SHA-256 해시만 저장합니다. 로그인 유지 미선택 시 브라우저 세션 쿠키와
서버 유효기간 1일, 선택 시 30일을 적용합니다. 로그아웃하면 서버 세션과 쿠키를 삭제합니다.
운영 환경에서는 `NODE_ENV=production` 및 HTTPS가 필요합니다(Secure 쿠키).

프런트엔드 API: `POST /api/auth/check-email`, `POST /api/auth/signup`,
`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
쓰기 요청은 동일 출처의 JSON만 허용하며 프록시는 세션 쿠키를 양방향 전달합니다.
backend 경로는 `/auth/*`이며 인터넷에 직접 노출하기보다 프런트엔드 서버에서 접근하도록 구성합니다.
현재 요청 제한은 backend가 보는 IP당 분당 30회로, 프록시 환경에서는 사용자 간 한도를 공유합니다.
여러 서버로 운영할 때는 신뢰 프록시 설정과 공유 저장소 기반 요청 제한으로 확장해야 합니다.

`npm run test:auth`는 별도 포트(18080/15173)와 메모리 DB로 가입·중복·로그인·SSR 로그인 표시·
쿠키·로그아웃·출처 검사를 수행합니다. 기존 DB에 테스트 계정을 추가하지 않습니다.
`DATABASE_PATH` 환경 변수로 backend DB 위치를 지정할 수 있습니다.

이메일 소유권 인증 메일 및 비밀번호 재설정은 메일 발송 서비스가 연결되지 않아 아직 제공하지 않습니다.
이메일 중복 확인은 이메일 소유권 인증을 의미하지 않습니다.
