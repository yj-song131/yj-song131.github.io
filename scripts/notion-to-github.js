#!/usr/bin/env node

/**
 * 노션 페이지를 GitHub Pages 블로그로 자동 마이그레이션하는 스크립트
 * 
 * 사용법:
 * node scripts/notion-to-github.js <notion-page-id> [--category "Computer Vision"|"LLM"] [--dry-run]
 * 
 * 예시:
 * node scripts/notion-to-github.js abc123def456 --category "Computer Vision"
 */

// 환경 변수 로드
require('dotenv').config();

const { Client } = require('@notionhq/client');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// 환경 변수에서 설정 가져오기
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const GITHUB_REPO_PATH = process.cwd();
const BLOG_URL = 'https://yeojins.github.io';

if (!NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN 환경 변수가 설정되지 않았습니다.');
  console.error('   .env 파일을 생성하거나 환경 변수를 설정해주세요.');
  process.exit(1);
}

// 노션 클라이언트 초기화
const notion = new Client({ auth: NOTION_TOKEN });

/**
 * 이미지 다운로드 함수
 */
async function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(outputPath);
    
    protocol.get(imageUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 리다이렉트 처리
        return downloadImage(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`이미지 다운로드 실패: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    }).on('error', (err) => {
      require('fs').unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * 노션 블록을 마크다운으로 변환
 */
async function convertBlocksToMarkdown(blocks, imageDir) {
  let markdown = '';
  const imageMap = new Map(); // 원본 URL -> 로컬 경로 매핑
  let numberedListCounter = 0; // 번호 목록 카운터
  let inNumberedList = false; // 번호 목록 안에 있는지 여부

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prevBlock = i > 0 ? blocks[i - 1] : null;
    const nextBlock = i < blocks.length - 1 ? blocks[i + 1] : null;

    // 번호 목록 연속 처리
    if (block.type === 'numbered_list_item') {
      if (prevBlock?.type !== 'numbered_list_item') {
        numberedListCounter = 0;
        inNumberedList = true;
      }
      numberedListCounter++;
    } else {
      if (inNumberedList && prevBlock?.type === 'numbered_list_item') {
        markdown += '\n'; // 번호 목록 끝에 빈 줄 추가
      }
      inNumberedList = false;
      numberedListCounter = 0;
    }

    switch (block.type) {
      case 'paragraph':
        if (block.paragraph.rich_text.length > 0) {
          markdown += convertRichText(block.paragraph.rich_text) + '\n\n';
        } else {
          markdown += '\n';
        }
        break;

      case 'heading_1':
        markdown += `# ${convertRichText(block.heading_1.rich_text)}\n\n`;
        break;

      case 'heading_2':
        markdown += `## ${convertRichText(block.heading_2.rich_text)}\n\n`;
        break;

      case 'heading_3':
        markdown += `### ${convertRichText(block.heading_3.rich_text)}\n\n`;
        break;

      case 'bulleted_list_item':
        const bulletText = convertRichText(block.bulleted_list_item.rich_text);
        // 다음 블록이 같은 리스트 타입이 아니면 빈 줄 추가
        if (nextBlock?.type !== 'bulleted_list_item') {
          markdown += `- ${bulletText}\n\n`;
        } else {
          markdown += `- ${bulletText}\n`;
        }
        break;

      case 'numbered_list_item':
        const numberedText = convertRichText(block.numbered_list_item.rich_text);
        // 다음 블록이 같은 리스트 타입이 아니면 빈 줄 추가
        if (nextBlock?.type !== 'numbered_list_item') {
          markdown += `${numberedListCounter}. ${numberedText}\n\n`;
        } else {
          markdown += `${numberedListCounter}. ${numberedText}\n`;
        }
        break;

      case 'to_do':
        const checked = block.to_do.checked ? 'x' : ' ';
        markdown += `- [${checked}] ${convertRichText(block.to_do.rich_text)}\n`;
        break;

      case 'code':
        const language = block.code.language || '';
        markdown += `\`\`\`${language}\n${convertRichText(block.code.rich_text)}\n\`\`\`\n\n`;
        break;

      case 'quote':
        markdown += `> ${convertRichText(block.quote.rich_text)}\n\n`;
        break;

      case 'divider':
        markdown += '---\n\n';
        break;

      case 'image':
        const imageUrl = block.image.type === 'external' 
          ? block.image.external.url 
          : block.image.file.url;
        
        // 이미지 파일명 생성
        const imageExt = path.extname(new URL(imageUrl).pathname) || '.png';
        const imageFileName = `notion-image-${Date.now()}-${Math.random().toString(36).substring(7)}${imageExt}`;
        const imageLocalPath = path.join(imageDir, imageFileName);
        const imageWebPath = `/assets/images/${imageFileName}`;

        try {
          // 이미지 다운로드
          await downloadImage(imageUrl, imageLocalPath);
          imageMap.set(imageUrl, imageWebPath);
          markdown += `![${imageFileName}](${imageWebPath})\n\n`;
        } catch (error) {
          console.warn(`⚠️  이미지 다운로드 실패: ${imageUrl}`, error.message);
          markdown += `![이미지 로드 실패](${imageUrl})\n\n`;
        }
        break;

      case 'equation':
        markdown += `$$${block.equation.expression}$$\n\n`;
        break;

      case 'callout':
        // Callout은 인용 블록으로 변환
        const calloutIcon = block.callout.icon?.emoji || '💡';
        const calloutText = convertRichText(block.callout.rich_text);
        markdown += `> **${calloutIcon} ${calloutText}**\n\n`;
        break;

      case 'toggle':
        // Toggle은 접을 수 있는 섹션으로 변환 (HTML details 태그 사용)
        const toggleText = convertRichText(block.toggle.rich_text);
        markdown += `<details>\n<summary>${toggleText}</summary>\n\n`;
        break;

      case 'table':
        // 테이블은 기본적으로 지원하지 않지만, 나중에 추가 가능
        markdown += `<!-- Table block (not yet supported) -->\n\n`;
        break;

      case 'column_list':
        // 컬럼 리스트는 일반 리스트로 변환
        break;

      default:
        // 알 수 없는 블록 타입은 주석으로 표시
        console.warn(`⚠️  알 수 없는 블록 타입: ${block.type}`);
        markdown += `<!-- Unsupported block type: ${block.type} -->\n\n`;
        break;
    }

    // 자식 블록이 있으면 재귀적으로 처리
    if (block.has_children) {
      const children = await notion.blocks.children.list({ block_id: block.id });
      const childMarkdown = await convertBlocksToMarkdown(children.results, imageDir);
      
      // Toggle 블록의 경우 details 태그 닫기
      if (block.type === 'toggle') {
        markdown += childMarkdown;
        markdown += `</details>\n\n`;
      } else {
        markdown += childMarkdown;
      }
    }
  }

  return markdown;
}

/**
 * Rich Text을 마크다운으로 변환 (서식 중첩 지원)
 */
function convertRichText(richTextArray) {
  return richTextArray.map(text => {
    let content = text.plain_text;
    
    // 서식 적용 순서 중요: code > strikethrough > bold > italic
    // 링크는 가장 바깥쪽에 적용
    if (text.annotations.code) {
      content = `\`${content}\``;
    } else {
      if (text.annotations.strikethrough) {
        content = `~~${content}~~`;
      }
      if (text.annotations.bold) {
        content = `**${content}**`;
      }
      if (text.annotations.italic) {
        content = `*${content}*`;
      }
    }
    
    // 링크 처리 (가장 바깥쪽)
    if (text.href) {
      content = `[${content}](${text.href})`;
    }
    
    return content;
  }).join('');
}

/**
 * 노션 페이지를 Jekyll 포스트로 변환
 */
async function convertNotionPageToPost(pageId, options = {}) {
  const { category, dryRun = false } = options;

  console.log(`📄 노션 페이지 가져오는 중: ${pageId}...`);

  // 페이지 정보 가져오기
  const page = await notion.pages.retrieve({ page_id: pageId });
  
  // 페이지 제목 가져오기
  const title = page.properties.title?.title?.[0]?.plain_text || 
                page.properties.Name?.title?.[0]?.plain_text ||
                'Untitled';

  // 페이지 블록 가져오기
  const blocks = await notion.blocks.children.list({ block_id: pageId });
  
  // 이미지 저장 디렉토리 생성
  const imagesDir = path.join(GITHUB_REPO_PATH, 'assets', 'images');
  await fs.mkdir(imagesDir, { recursive: true });

  // 마크다운 변환
  const content = await convertBlocksToMarkdown(blocks.results, imagesDir);

  // 날짜 가져오기 (생성일 또는 커스텀 날짜)
  const createdDate = new Date(page.created_time);
  const dateStr = createdDate.toISOString().split('T')[0];
  const year = createdDate.getFullYear();
  const month = String(createdDate.getMonth() + 1).padStart(2, '0');
  const day = String(createdDate.getDate()).padStart(2, '0');

  // 파일명 생성 (제목을 URL-safe하게 변환)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = `${year}-${month}-${day}-${slug}.md`;

  // Jekyll front matter 생성
  const frontMatter = {
    title: title,
    date: `${dateStr} ${createdDate.toTimeString().split(' ')[0]} +0900`,
    last_modified_at: new Date(page.last_edited_time).toISOString().split('T')[0],
  };

  if (category) {
    frontMatter.categories = [category];
  }

  // Front matter를 YAML로 변환
  const yaml = require('js-yaml');
  const frontMatterYaml = yaml.dump(frontMatter, {
    lineWidth: -1,
    noRefs: true,
  });

  // 최종 마크다운 파일 내용
  const postContent = `---\n${frontMatterYaml}---\n\n${content}`;

  // 파일 저장
  const postPath = path.join(GITHUB_REPO_PATH, '_posts', filename);
  
  if (!dryRun) {
    await fs.writeFile(postPath, postContent, 'utf8');
    console.log(`✅ 포스트 파일 생성: ${postPath}`);
  } else {
    console.log(`[DRY RUN] 포스트 파일 생성 예정: ${postPath}`);
  }

  // 블로그 URL 생성 (Jekyll permalink 형식: /:categories/:title/)
  const categorySlug = category ? category.toLowerCase().replace(/\s+/g, '-') : '';
  const blogUrl = categorySlug 
    ? `${BLOG_URL}/${categorySlug}/${slug}/`
    : `${BLOG_URL}/${slug}/`;

  return {
    filename,
    path: postPath,
    title,
    blogUrl,
    pageId,
  };
}

/**
 * GitHub에 커밋 및 푸시
 */
async function commitAndPushToGitHub(postInfo, dryRun = false) {
  if (dryRun) {
    console.log('[DRY RUN] GitHub 커밋/푸시 스킵');
    return;
  }

  console.log('📤 GitHub에 커밋하는 중...');

  try {
    // Git 상태 확인
    execSync('git add _posts/ assets/images/', { cwd: GITHUB_REPO_PATH, stdio: 'inherit' });
    execSync(`git commit -m "Add post: ${postInfo.title}"`, { 
      cwd: GITHUB_REPO_PATH, 
      stdio: 'inherit' 
    });
    execSync('git push origin main', { 
      cwd: GITHUB_REPO_PATH, 
      stdio: 'inherit' 
    });
    console.log('✅ GitHub에 푸시 완료');
  } catch (error) {
    console.error('❌ GitHub 커밋/푸시 실패:', error.message);
    throw error;
  }
}

/**
 * GitHub에 커밋만 (푸시 스킵)
 */
async function commitOnlyToGitHub(postInfo, dryRun = false) {
  if (dryRun) {
    console.log('[DRY RUN] GitHub 커밋 스킵');
    return;
  }

  console.log('📤 GitHub에 커밋하는 중...(push는 하지 않음)');

  try {
    execSync('git add _posts/ assets/images/', { cwd: GITHUB_REPO_PATH, stdio: 'inherit' });
    execSync(`git commit -m "Add post: ${postInfo.title}"`, {
      cwd: GITHUB_REPO_PATH,
      stdio: 'inherit',
    });
    console.log('✅ 로컬 커밋 완료 (이제 직접 git push 하시면 됩니다)');
  } catch (error) {
    console.error('❌ GitHub 커밋 실패:', error.message);
    throw error;
  }
}

/**
 * 노션 페이지에 블로그 링크 업데이트
 */
async function updateNotionPageLink(pageId, blogUrl, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY RUN] 노션 페이지 링크 업데이트 예정: ${blogUrl}`);
    return;
  }

  console.log('🔗 노션 페이지에 블로그 링크 업데이트 중...');

  try {
    // 노션 데이터베이스에서 'Archived Link' 또는 'Blog Link' 속성 찾기
    // 속성 이름은 사용자가 설정한 이름에 맞게 변경해야 합니다
    const propertyName = 'Archived Link'; // 또는 'Blog Link'
    
    await notion.pages.update({
      page_id: pageId,
      properties: {
        [propertyName]: {
          url: blogUrl,
        },
      },
    });
    console.log('✅ 노션 페이지 링크 업데이트 완료');
  } catch (error) {
    console.warn('⚠️  노션 페이지 링크 업데이트 실패 (속성 이름을 확인해주세요):', error.message);
  }
}

/**
 * 노션 페이지 본문 삭제
 */
async function clearNotionPageContent(pageId, dryRun = false) {
  if (dryRun) {
    console.log('[DRY RUN] 노션 페이지 본문 삭제 스킵');
    return;
  }

  console.log('🧹 노션 페이지 본문 삭제 중...');

  try {
    // 모든 블록 가져오기
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const response = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: startCursor,
      });

      // 각 블록 삭제
      for (const block of response.results) {
        try {
          await notion.blocks.delete({ block_id: block.id });
        } catch (error) {
          // 이미 삭제된 블록이거나 삭제할 수 없는 블록은 무시
          if (!error.message.includes('not found') && !error.message.includes('cannot be deleted')) {
            console.warn(`⚠️  블록 삭제 실패: ${block.id}`, error.message);
          }
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    console.log('✅ 노션 페이지 본문 삭제 완료');
  } catch (error) {
    console.error('❌ 노션 페이지 본문 삭제 실패:', error.message);
    throw error;
  }
}

/**
 * 노션 페이지 ID 정규화 (하이픈 제거)
 */
function normalizeNotionPageId(pageIdOrUrl) {
  // URL에서 페이지 ID 추출
  if (pageIdOrUrl.includes('notion.so')) {
    const match = pageIdOrUrl.match(/notion\.so\/[^\/]*-([a-f0-9]{32})/);
    if (match) {
      return match[1];
    }
  }
  
  // 하이픈 제거 (32자리 ID로 변환)
  const cleaned = pageIdOrUrl.replace(/-/g, '');
  
  // 32자리인지 확인
  if (cleaned.length === 32) {
    return cleaned;
  }
  
  return pageIdOrUrl; // 변환 실패 시 원본 반환
}

/**
 * 메인 함수
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('사용법: node scripts/notion-to-github.js <notion-page-id> [--category "Computer Vision"|"LLM"|"World Model"] [--dry-run]');
    process.exit(1);
  }

  const pageId = normalizeNotionPageId(args[0]);
  let category = null;
  let dryRun = false;
  let noPush = false;
  let noNotion = false; // 링크 업데이트 + 본문 삭제 모두 스킵

  // 옵션 파싱
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      category = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--no-push') {
      noPush = true;
    } else if (args[i] === '--no-notion') {
      noNotion = true;
    }
  }

  if (dryRun) {
    console.log('🔍 DRY RUN 모드: 실제 변경사항은 적용되지 않습니다.\n');
  }

  try {
    // 1단계: 노션 페이지를 마크다운으로 변환하고 GitHub에 저장
    console.log('\n📝 1단계: 노션 페이지를 마크다운으로 변환 중...\n');
    const postInfo = await convertNotionPageToPost(pageId, { category, dryRun });

    // 2단계: GitHub에 커밋 및 푸시
    if (!dryRun) {
      console.log(`\n📤 2단계: GitHub에 ${noPush ? '커밋' : '커밋 및 푸시'} 중...\n`);
      if (noPush) {
        await commitOnlyToGitHub(postInfo, dryRun);
      } else {
        await commitAndPushToGitHub(postInfo, dryRun);
      }
    }

    // 3단계: 노션 페이지에 블로그 링크 업데이트
    // 안전을 위해 push를 하지 않는 경우(=원격 반영이 확정되지 않음)에는 기본적으로 노션 변경을 스킵
    if (dryRun) {
      console.log('\n🔗 3단계: 노션 페이지에 블로그 링크 업데이트 중...\n');
      await updateNotionPageLink(pageId, postInfo.blogUrl, dryRun);
    } else if (noNotion) {
      console.log('\n⏭️ 3단계: --no-notion 옵션으로 노션 링크 업데이트를 건너뜁니다.\n');
    } else if (noPush) {
      console.log('\n⏭️ 3단계: --no-push 사용 시, 안전을 위해 노션 링크 업데이트를 기본 스킵합니다.\n');
      console.log('   (원하면 push 후 다시 실행하거나, --no-notion을 빼고 push 성공 뒤에 수행하세요)\n');
    } else {
      console.log('\n🔗 3단계: 노션 페이지에 블로그 링크 업데이트 중...\n');
      await updateNotionPageLink(pageId, postInfo.blogUrl, dryRun);
    }

    console.log('\n✅ 모든 작업이 완료되었습니다!');
    console.log(`📝 블로그 URL: ${postInfo.blogUrl}`);
  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = {
  convertNotionPageToPost,
  commitAndPushToGitHub,
  commitOnlyToGitHub,
  updateNotionPageLink,
  clearNotionPageContent,
};
