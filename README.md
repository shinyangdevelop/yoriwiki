# 요리위키

- `backend/`: Express API, SQLite DB (`backend/database.db`)
- `frontend/`: SvelteKit 화면 및 `/api/*` 프록시
- `dev.mjs`: 두 개발 서버 동시 실행 및 종료

## 요구 사항과 설치

Node.js **22.12 이상**(Node 24 사용 가능), npm, Git 및 서브모듈 접근 권한이 필요합니다.

```sh
git clone --recurse-submodules https://github.com/shinyangdevelop/yoriwiki.git
cd yoriwiki
```

일반 clone을 이미 했다면 `git submodule update --init --recursive`를 실행하세요.
`frontend/`는 `easternY-parh0/yori-wiki2`의 별도 저장소입니다. `.gitmodules`가 SSH 주소를 사용하므로
GitHub SSH 접근이 필요합니다. HTTPS를 사용하려면 다음처럼 로컬 설정만 변경할 수 있습니다.

```sh
git config submodule.frontend.url https://github.com/easternY-parh0/yori-wiki2.git
git submodule update --init --recursive
```

루트에서 최초 한 번:

```powershell
npm run setup
```

이후 루트에서 실행:

```powershell
npm run dev
```

직접 `node dev.mjs`로 실행해도 됩니다. 화면은 http://127.0.0.1:5173,
backend는 http://127.0.0.1:8080 으로 접근합니다. Vite는 루프백에 바인딩하고,
Express는 현재 호스트를 지정하지 않아 모든 인터페이스에서 수신합니다. 외부 접근은 방화벽으로 제한하세요.
Ctrl+C로 둘을 종료합니다.
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

## 환경 변수

| 변수 | 코드에서 확인한 기본값 | 용도 |
|---|---|---|
| `PORT` | `8080` | Express 포트. 통합 실행기의 기본 BACKEND_URL에도 반영 |
| `FRONTEND_PORT` | `5173` | 통합 실행기의 Vite 포트. 단독 Vite 실행은 CLI `--port` 사용 |
| `BACKEND_URL` | 통합 실행: `http://127.0.0.1:${PORT}` / 단독 프런트엔드: `http://127.0.0.1:8080` | SvelteKit 서버에서 접근할 Express 주소 |
| `BASE_PATH` | 빈 문자열 | 프런트엔드 공개 경로 접두사. 빌드·실행 환경에서 설정 |
| `ALLOWED_HOSTS` | 미설정(Vite 기본 허용 목록) | 허용할 호스트 이름을 쉼표로 구분. 공백과 빈 항목 제거 |
| `NODE_ENV` | 통합 실행기·Express는 설정하지 않음. Vite dev는 미설정 시 `development`, build는 `production` | Express는 정확히 `production`일 때 Secure 세션 쿠키 사용 |
| `DATABASE_PATH` | `backend/database.db`의 절대 경로 | SQLite 파일 위치. 상대 경로는 백엔드 프로세스 작업 디렉토리 기준. 테스트는 `:memory:` |
| `RECIPE_API_BASE` | `http://localhost:8080` | `node backend/scripts/import-recipes.mjs`만 사용하는 가져오기 대상 API 주소 |

통합 실행기는 루트 `.env`를 자동으로 읽지 않습니다. 셸 또는 systemd 환경으로 설정하세요.
`frontend/.env`에서는 SvelteKit이 `BACKEND_URL`을 읽습니다. 통합 실행기가 전달하는 환경 변수가 우선합니다.
`BASE_PATH`·`ALLOWED_HOSTS`는 `.env`가 아닌 **프로세스 환경 변수**로 설정해야
`svelte-kit sync`, check, Vite build/dev가 일관되게 적용됩니다.
`ALLOWED_HOSTS`에는 프로토콜·경로·포트 없이 호스트 이름을 넣습니다. 생략하면 Vite의 localhost·IP 기본 허용을 유지하며 전체 호스트를 허용하지 않습니다.

## 루트와 하위 경로 실행

`BASE_PATH`를 생략하거나 빈 문자열로 설정하면 `https://example.com/`에서 실행합니다.
`BASE_PATH=/yoriwiki`이면 `https://example.com/yoriwiki`에서 실행합니다.
`/foo`, `/projects/yori`처럼 임의의 경로도 가능합니다. 끝의 `/`는 제거하며 `/`는 루트로 정규화합니다.
잘못된 값(선행 `/` 없음, 중복 슬래시, 쿼리·해시·공백·역슬래시·점 세그먼트)은 명확한 오류로 거부합니다.
경로는 빌드 시 결정되므로 운영 빌드의 접두사를 바꾸면 다시 빌드하세요.

Linux/macOS 예시:

```sh
PORT=3000 \
FRONTEND_PORT=5173 \
BACKEND_URL=http://127.0.0.1:3000 \
BASE_PATH=/yoriwiki \
ALLOWED_HOSTS=project.pernoctation.net,dev.example.com \
npm start
```

PowerShell 예시:

```powershell
$env:PORT='3000'
$env:FRONTEND_PORT='5173'
$env:BACKEND_URL='http://127.0.0.1:3000'
$env:BASE_PATH='/yoriwiki'
$env:ALLOWED_HOSTS='project.pernoctation.net,dev.example.com'
npm start
```

위 경로·포트·호스트는 **배포 예시**이며 소스의 필수 값이 아닙니다.
루트 실행으로 돌아가려면 Linux/macOS는 `unset BASE_PATH`, PowerShell은 `Remove-Item Env:BASE_PATH -ErrorAction SilentlyContinue`를 실행합니다.

요청 흐름은 `브라우저 → {BASE_PATH}/api/auth/login → SvelteKit → BACKEND_URL/auth/login → Express`입니다.
공개 링크와 API는 공통 `appPath()`를 사용하고, 백엔드 라우트·프록시 내부 대상·이미 공개 경로인
`page.url.pathname`에는 접두사를 더하지 않습니다. 외부 링크와 import 이미지도 유지합니다.
기존에 구현되지 않은 `/categories`, `/contact`, `/refrigerator`, 비밀번호 변경·재설정 등의 시안 링크는
접두사를 반영하지만 페이지 자체가 새로 구현되지는 않습니다.

## nginx 예시

다음은 접두사가 `/yoriwiki`인 **개발 서버 프록시 예시**입니다. 호스트·경로·포트를 실제 환경으로 바꾸세요.
기존 HTTPS server 블록에 location을 적용하고 인증서 설정은 해당 서버의 설정을 사용하세요.

```nginx
# http 블록 안: Vite HMR WebSocket 연결 지원
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name project.example.com;

    location = /yoriwiki {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location /yoriwiki/ {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

**접두사를 보존해야 합니다.** `proxy_pass http://127.0.0.1:5173;`처럼 URI 없는 형태를 사용하세요.
접두사 location에서 `proxy_pass http://127.0.0.1:5173/;`로 끝내면 매칭된 경로를 제거할 수 있습니다.
SvelteKit 기본 `trailingSlash: 'never'`를 유지하므로 nginx에서 `/yoriwiki`와 `/yoriwiki/` 사이의
별도 리다이렉트를 추가하지 않습니다. SvelteKit이 필요한 정규화를 수행합니다.
루트 배포는 `BASE_PATH`를 비우고 위 두 location 대신 같은 헤더를 가진 `location /`를 사용하세요.

`npm start`는 현재 Vite 개발 서버와 nodemon을 실행합니다. 권장 운영 배포 방식은 아닙니다.
Raspberry Pi에서 정식 운영하려면 adapter-node 등 서버에 적합한 SvelteKit 어댑터와 빌드 실행 구성을 준비하세요.
현재 adapter-auto 빌드 성공만으로 일반 Node 서버용 실행 파일이 만들어지는 것은 아닙니다.

## 선택 사항: systemd

다음은 현재 `npm start` 실행기를 서비스로 관리하는 예시입니다. 사용자, 경로와 Node 설치 경로를 실제 값으로 바꾸세요.
로그인 셸의 nvm 설정은 systemd가 자동으로 읽지 않으므로 PATH를 명시합니다.

```ini
[Unit]
Description=YoriWiki
After=network.target

[Service]
Type=simple
User=someuser
WorkingDirectory=/path/to/yoriwiki
Environment="PATH=/path/to/node-vXX/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/etc/yoriwiki.env
ExecStart=/path/to/node-vXX/bin/npm start
Restart=on-failure
RestartSec=5
KillMode=control-group

[Install]
WantedBy=multi-user.target
```

`/etc/yoriwiki.env` 예시(저장소에 커밋하지 않는 배포 설정):

```dotenv
PORT=3000
FRONTEND_PORT=5173
BACKEND_URL=http://127.0.0.1:3000
BASE_PATH=/yoriwiki
ALLOWED_HOSTS=project.example.com
NODE_ENV=production
DATABASE_PATH=/path/to/yoriwiki/backend/database.db
```

EnvironmentFile 대신 `Environment="BASE_PATH=/yoriwiki"` 같은 줄들을 Service에 넣어도 됩니다.
`NODE_ENV=production`에서는 로그인 쿠키를 위해 **HTTPS가 필요**합니다. 위 HTTP nginx 예시만으로는 충분하지 않습니다.
서비스 파일을 만들거나 수정한 뒤 `sudo systemctl daemon-reload`, `sudo systemctl enable --now yoriwiki.service`를 실행합니다.

## 검증과 Raspberry Pi 업데이트

```sh
BASE_PATH= npm run check
BASE_PATH= npm run build
BASE_PATH= npm run test:auth
BASE_PATH=/yoriwiki npm run check
BASE_PATH=/yoriwiki npm run build
BASE_PATH=/yoriwiki npm run test:auth
BASE_PATH=/projects/yori npm run test:auth
node --test frontend/tests/config.test.mjs
npm run test:explore
npm run test:search
```

인증 통합 테스트는 메모리 DB로 양쪽 서버를 시작해 링크·폼·동적 레시피·검색·SSR 로그인·API 프록시를 확인합니다.
개발 변경은 먼저 frontend 저장소에서 커밋하고 원격에 게시한 뒤, 상위 저장소에서 서브모듈 포인터를 커밋·게시합니다.
상위 저장소가 가리키는 frontend 커밋을 배포해야 하므로 업데이트에 `--remote`를 사용하지 않습니다.
두 저장소의 변경이 배포 브랜치에 게시된 후 Raspberry Pi에서:

```sh
cd /path/to/yoriwiki
git pull --ff-only
git submodule update --init --recursive
npm run setup
sudo systemctl restart yoriwiki.service
sudo systemctl status yoriwiki.service --no-pager
journalctl -u yoriwiki.service -n 50 --no-pager
```

작업 디렉토리와 서비스 이름은 실제 값으로 바꾸세요. EnvironmentFile의 설정은 재시작한 서비스가 다시 읽습니다.
현재 개발 실행기는 빌드 파일을 사용하지 않습니다. 운영 어댑터를 도입한 뒤에는 서비스 재시작 전에
동일한 BASE_PATH로 빌드하는 단계를 추가하세요.

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
