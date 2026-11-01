# 세법 쟁점 검토실

사실관계를 입력하면 세법, 유권해석, 심판례, 판례에 비추어 쟁점별로 검토하는 웹사이트입니다. Vercel에 그대로 배포할 수 있습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `public/` | 화면 (HTML, CSS, JS) |
| `api/review.js` | 사실관계 검토: 검색어 추출 → 법제처 검색 → Claude 분석 |
| `api/search.js` | 법제처 실시간 검색 |
| `api/library.js`, `api/config.js` | 내장 자료 목록, 기능 켜짐 상태 |
| `lib/library.js` | 내용을 확인한 내장 근거 26건 |
| `lib/lawApi.js` | 법제처 OPEN API 클라이언트 |
| `lib/review.js` | Claude 호출과 프롬프트 |
| `scripts/dev.js`, `test/` | 로컬 개발 서버, 테스트 |

## 환경 변수

Vercel의 Project Settings → Environment Variables에 넣습니다. 키를 코드나 저장소에 넣지 마세요.

| 이름 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 예 | Claude API 키. 검토할 때마다 요금이 나갑니다. |
| `ACCESS_CODE` | 예 | 사이트 접근 코드. 없으면 검토와 검색이 꺼집니다. 길고 추측하기 어려운 값을 쓰세요. |
| `LAW_OC` | 아니요 | 법제처 OPEN API 인증값. 없으면 내장 자료실만으로 검토합니다. |
| `CLAUDE_MODEL` | 아니요 | 기본값은 `claude-opus-5-5`입니다. |

## 배포

### 방법 1: GitHub 연동

1. 이 폴더를 GitHub 저장소에 올립니다. `node_modules`와 `.env.local`은 올리지 않습니다.
2. [Vercel](https://vercel.com/new)에서 저장소를 가져옵니다. Framework Preset은 `Other`로 두고 빌드 설정은 바꾸지 않습니다.
3. 위 환경 변수를 넣고 Deploy를 누릅니다.

### 방법 2: Vercel CLI

[Node.js 24 LTS](https://nodejs.org/)를 설치한 뒤 이 폴더에서 실행합니다.

```powershell
npx vercel
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add ACCESS_CODE
npx vercel --prod
```

## 법제처 실시간 검색 켜기

1. [국가법령정보 공동활용](https://open.law.go.kr/)에 가입해 OPEN API를 신청합니다. 판례, 조세심판원 특별행정심판례, 국세청 법령해석을 포함해 신청합니다.
2. 신청 때 Vercel 도메인을 등록하고, 받은 인증값을 `LAW_OC`로 넣습니다.
3. 사이트의 "원문 찾기"에서 검색해 봅니다.

"인증을 거부했습니다" 오류가 나면 등록 정보가 맞지 않는 것입니다. 법제처는 서버 IP나 도메인을 검사하는데, Vercel의 발신 IP는 고정되어 있지 않습니다. 도메인 등록으로 통과하지 못하면 고정 IP가 있는 중계 서버나 Vercel의 고정 IP 기능이 필요합니다. 이 경우에도 사이트는 내장 자료실로 계속 동작하고, 결과 화면에 검색 실패를 표시합니다.

## 로컬 실행

`.env.example`을 `.env.local`로 복사해 값을 채운 뒤 실행합니다.

```powershell
npm install
npm run dev
npm test
```

테스트는 실제 API를 부르지 않고 모의 서버를 씁니다.

## 인용 안전장치

- 서버는 내장 자료와 법제처에서 받은 자료만 Claude에 주고, `[[id]]` 형식으로만 인용하게 합니다.
- 화면은 확인된 자료에 없는 사건번호와 조문에 `미확인` 표시를 붙입니다.
- 서버는 근거 목록에서 없는 ID를 지웁니다.
- 국세청 해석은 법제처 API에 본문이 없어 제목만 들어오며, 내용을 추측하지 않도록 지시합니다.

## 알아 둘 점

- 입력한 사실관계는 Claude API로 전송됩니다. 서버 로그에는 오류 종류만 남깁니다.
- 호출 제한은 인스턴스별 간이 제한입니다. 실제 보호는 접근 코드가 맡으므로 코드를 공유 범위에 맞게 관리하세요. Anthropic 콘솔에서 지출 한도도 설정하세요.
- 검토는 1~3분 걸립니다. `vercel.json`에서 함수 실행 시간을 300초로 잡았습니다. 요금제 한도가 더 짧으면 시간 초과가 날 수 있습니다.
- 내장 자료의 요지는 민간 DB 등을 요약한 것이며 조문은 수록본 기준입니다. 실제 사건에 인용하기 전에 공식 원문을 확인하세요.
- 이 사이트의 결과는 세무대리인의 의견을 대신하지 않습니다.
