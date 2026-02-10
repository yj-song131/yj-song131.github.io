# 노션 → GitHub Pages 자동 마이그레이션 스크립트

노션 페이지를 GitHub Pages 블로그로 자동으로 마이그레이션하는 스크립트입니다.

## 기능

1. **노션 페이지를 마크다운으로 변환**: 노션 페이지의 모든 콘텐츠를 마크다운 형식으로 변환합니다.
2. **이미지 다운로드**: 노션의 임시 이미지 링크를 로컬 파일로 다운로드하고 경로를 업데이트합니다.
3. **Jekyll 포스트 생성**: Jekyll 형식의 포스트 파일을 생성합니다.
4. **GitHub 자동 커밋/푸시**: 생성된 포스트를 GitHub에 자동으로 커밋하고 푸시합니다.
5. **노션 페이지 링크 업데이트**: 노션 페이지에 블로그 링크를 자동으로 추가합니다.

## 설치

### 1. 필요한 패키지 설치

```bash
npm install
```

### 2. 노션 통합(Integration) 생성

1. [노션 통합 페이지](https://www.notion.so/my-integrations)에 접속
2. "새 통합 만들기" 클릭
3. 통합 이름 입력 (예: "Blog Migration")
4. 통합 생성 후 **Internal Integration Token** 복사

### 3. 노션 데이터베이스에 통합 연결

1. 마이그레이션할 노션 데이터베이스 열기
2. 우측 상단 "..." 메뉴 → "연결" → 생성한 통합 선택
3. 통합이 데이터베이스에 접근할 수 있도록 권한 부여

### 4. 노션 데이터베이스에 "Archived Link" 속성 추가

1. 노션 데이터베이스에서 새 속성 추가
2. 속성 타입: **URL**
3. 속성 이름: **Archived Link** (또는 원하는 이름)

### 5. 환경 변수 설정

`env.example` 파일을 복사하여 `.env` 파일을 생성하고 값을 입력하세요:

```bash
cp env.example .env
```

`.env` 파일 편집:
```
NOTION_TOKEN=여기에_노션에서_받은_토큰_전체를_붙여넣으세요
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**참고:** 노션 통합 토큰은 보통 `secret_`으로 시작하지만, 노션에서 제공한 토큰을 그대로 사용하면 됩니다.

## 사용법

### 기본 사용법

```bash
node scripts/notion-to-github.js <노션-페이지-ID>
```

### 카테고리 지정

```bash
node scripts/notion-to-github.js <노션-페이지-ID> --category "Computer Vision"
```

또는

```bash
node scripts/notion-to-github.js <노션-페이지-ID> --category "LLM"
```

### 테스트 모드 (Dry Run)

실제로 변경사항을 적용하지 않고 테스트하려면:

```bash
node scripts/notion-to-github.js <노션-페이지-ID> --category "Computer Vision" --dry-run
```

## 노션 페이지 ID 찾기

노션 페이지의 URL에서 페이지 ID를 찾을 수 있습니다:

```
https://www.notion.so/My-Page-abc123def456ghi789jkl012mno345pq
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                    이 부분이 페이지 ID입니다
```

페이지 ID는 32자리 문자열입니다 (하이픈 제외).

## 스크립트 동작 과정

1. **노션 페이지 가져오기**: 노션 API를 통해 페이지 정보와 블록을 가져옵니다.
2. **마크다운 변환**: 노션 블록을 마크다운 형식으로 변환합니다.
3. **이미지 다운로드**: 노션의 임시 이미지 링크를 `assets/images/` 디렉토리에 다운로드합니다.
4. **Jekyll 포스트 생성**: `_posts/` 디렉토리에 `YYYY-MM-DD-title.md` 형식의 파일을 생성합니다.
5. **GitHub 커밋/푸시**: 변경사항을 Git에 커밋하고 GitHub에 푸시합니다.
6. **노션 페이지 업데이트**: 노션 페이지의 "Archived Link" 속성에 블로그 URL을 추가합니다.

## 주의사항

- ⚠️ 이미지 다운로드가 실패할 수 있습니다. 노션의 임시 링크는 만료될 수 있습니다.
- ⚠️ Git 커밋/푸시는 로컬 Git 설정에 따라 다를 수 있습니다.
- ⚠️ 노션 데이터베이스의 "Archived Link" 속성 이름이 정확해야 합니다.

## 문제 해결

### "NOTION_TOKEN 환경 변수가 설정되지 않았습니다"

`.env` 파일이 제대로 생성되었는지 확인하고, 스크립트에서 dotenv를 로드하는지 확인하세요.

### "노션 페이지 링크 업데이트 실패"

노션 데이터베이스에 "Archived Link" 속성이 있는지, 그리고 속성 타입이 URL인지 확인하세요. 속성 이름이 다르다면 스크립트의 `propertyName` 변수를 수정하세요.

### "이미지 다운로드 실패"

노션의 임시 이미지 링크가 만료되었을 수 있습니다. 노션 페이지를 다시 열어서 이미지를 확인하거나, 수동으로 이미지를 다운로드해야 할 수 있습니다.

## 예시

```bash
# Computer Vision 카테고리로 마이그레이션
node scripts/notion-to-github.js abc123def456ghi789jkl012mno345pq --category "Computer Vision"

# LLM 카테고리로 마이그레이션 (테스트 모드)
node scripts/notion-to-github.js abc123def456ghi789jkl012mno345pq --category "LLM" --dry-run
```

## 라이선스

MIT
