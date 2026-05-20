import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function loadEnvFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
    }
  } catch (error) {
    console.warn(`[env] Failed to load ${envPath}: ${error.message}`);
  }
}

loadEnvFile(path.resolve(ROOT_DIR, '.env'));

process.on('uncaughtException', (error) => console.error('[uncaughtException]', error));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8790);
const CACHE_DAYS = Number(process.env.CACHE_DAYS || 30);
const INITIAL_DAYS = Number(process.env.INITIAL_DAYS || 7);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5190,http://localhost:5190';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
const REGULATORY_DASHBOARD_URL = process.env.REGULATORY_DASHBOARD_URL || process.env.VITE_REGULATORY_DASHBOARD_URL || '';
const RSS_CONFIG_PATH = process.env.RSS_CONFIG_PATH || path.resolve(ROOT_DIR, 'data/rss_sources.json');
const CLIENT_DIST_DIR = path.resolve(ROOT_DIR, 'client/dist');
const API_VERSION = 'v25-render-pnpmfix';

const CORE_COLUMNS = [
  'uid', 'published_at', 'date', 'time', 'source', 'category', 'keywords', 'importance', 'qa_flag',
  'title', 'summary', 'link', 'rss_query_name', 'rss_query', 'collected_at', 'cache_updated_at'
];
const OPTIONAL_COLUMNS = [
  'article_summary', 'article_text', 'sub_tags', 'classification_reason',
  'classification_score', 'body_fetch_status'
];
const ALL_COLUMNS = [...CORE_COLUMNS, ...OPTIONAL_COLUMNS];
const TEXT_SEARCH_COLUMNS = ['title', 'summary', 'article_summary', 'article_text', 'source', 'keywords'];
const missingColumns = new Set();

const POLICY_KEYWORDS = [
  '가이드라인', '가이드', 'guidance', 'guideline', 'draft guidance', 'final guidance', '민원인안내서',
  '공무원지침서', '안내서', '지침', '해설서', '질의응답', 'Q&A', '행정예고', '입법예고', '고시',
  '훈령', '예규', '규정', '제정', '개정', '시행', '약전', '대한민국약전', '기준규격', 'EudraLex',
  '제도개선', '개선방안', '혁신방안', '의견수렴', '규제혁신', '규제개선', '심사기준'
];

const REGULATOR_KEYWORDS = [
  '식약처', '식품의약품안전처', 'MFDS', '의약품안전나라', 'FDA', 'USFDA', '미국 FDA',
  'EMA', 'European Medicines Agency', 'European Commission', 'EudraLex', 'PIC/S', 'PICS', 'ICH',
  'PMDA', 'EDQM', 'Ph. Eur', 'WHO', 'MHRA', 'TGA', 'Health Canada'
];

const GMP_KEYWORDS = ['GMP', '품질', '제조품질', '데이터완전성', 'Data Integrity', 'DI', '무균', '오염', '불순물', '밸리데이션', '실태조사', '제조소', '제조관리', '품질관리', '경고장', 'warning letter'];
// v13: 회수/처분은 실제 조치성 표현만 인정한다.
// '부적합', '검출 금지 물질' 같은 일반 규제/의학 문맥 단어는 회수·처분 근거로 쓰지 않는다.
const RECALL_KEYWORDS = [
  '회수', '자진회수', '강제회수', '회수 명령', '회수 조치', '회수 대상',
  '판매중지', '판매 중지', '판매정지', '사용중지', '사용 중지', '출하중지', '출하 중지',
  '잠정 제조', '잠정 판매', '제조·판매 중지', '제조판매 중지', '제조 판매 중지'
];
const ACTION_KEYWORDS = [
  '행정처분', '영업정지', '제조정지', '제조업무정지', '업무정지', '판매업무정지',
  '품목정지', '품목 제조정지', '품목 판매정지', '과징금', '과태료',
  '취소 처분', '처분 사전통지', '행정조치'
];
const LICENSE_ACTION_KEYWORDS = ['허가취소', '품목허가 취소', '품목 취소', '품목정지', '허가 정지', '취소 처분', '허가사항 직권변경'];
const QUALITY_SIGNAL_KEYWORDS = [
  '품질부적합', '품질 부적합', '부적합 판정', '기준 부적합', '규격 부적합',
  '검출 금지 물질', '검출금지물질', '이물', '오염', '불순물', '미생물', '엔도톡신',
  '품질 결함', '품질결함', '제조번호', '사용기한', '표시기재'
];
const OVERSEAS_KEYWORDS = ['FDA', 'EMA', 'PMDA', 'EDQM', 'WHO', 'MHRA', 'TGA', 'Health Canada', 'EudraLex', 'PIC/S', 'ICH'];
const CLINICAL_KEYWORDS = ['임상', '허가', '승인', '품목허가', '심사', '신약', '바이오시밀러', 'IND', 'NDA', 'BLA'];
const INSURANCE_KEYWORDS = ['약가', '급여', '보험', '수가', '건보', '심평원'];
const BUSINESS_KEYWORDS = ['매출', '영업이익', '기술수출', '투자', '계약', '공급', '수출', 'MOU', 'CDMO', '공장', '인수', '합병'];

const ACTION_GROUPS = [
  { key: 'recall', label: '회수·판매중지', description: '회수, 판매중지, 사용중지 등 실제 조치 기사', keywords: RECALL_KEYWORDS },
  { key: 'disposition', label: '행정처분·영업정지', description: '행정처분, 영업정지, 제조정지, 과징금 기사', keywords: ACTION_KEYWORDS },
  { key: 'license', label: '허가취소·품목정지', description: '품목허가 취소, 품목정지, 허가 관련 조치 기사', keywords: LICENSE_ACTION_KEYWORDS }
];

const CATEGORY_ORDER = ['회수/처분', 'GMP/품질', '정책/가이드라인', '식약처/규제', '해외규제', '허가/임상', '약가/보험', '산업/경영', '기타'];

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_KEY/SUPABASE_KEY가 설정되지 않았습니다.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY ? requireSupabase() : null;

function activeColumns() {
  return ALL_COLUMNS.filter((col) => !missingColumns.has(col));
}

function missingColumnFromError(error) {
  const text = [error?.message, error?.details, error?.hint, String(error || '')].filter(Boolean).join(' ');
  if (!text) return '';
  const patterns = [
    /column\s+(?:[\w]+\.)?([a-zA-Z_][\w]*)\s+does\s+not\s+exist/i,
    /Could\s+not\s+find\s+the\s+'([^']+)'\s+column/i,
    /Could\s+not\s+find\s+the\s+column\s+'([^']+)'/i,
    /'([^']+)'\s+column\s+of\s+'news_articles'/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

async function runWithColumnFallback(label, buildQuery) {
  const triedInThisRequest = new Set();
  for (let i = 0; i < ALL_COLUMNS.length + 2; i += 1) {
    const columnsForThisAttempt = activeColumns();
    const { data, error, count } = await buildQuery(columnsForThisAttempt);
    if (!error) return { data, count };

    const missing = missingColumnFromError(error);
    if (missing && ALL_COLUMNS.includes(missing)) {
      const wasAlreadyKnown = missingColumns.has(missing);
      missingColumns.add(missing);
      triedInThisRequest.add(missing);
      console.warn(
        `[schema fallback] ${label}: Supabase column '${missing}' is missing` +
        `${wasAlreadyKnown ? ' and was already ignored by another request' : ''}. Retrying with ${activeColumns().length} columns.`
      );
      continue;
    }
    throw error;
  }
  throw new Error(`${label}: Supabase 컬럼 호환성 처리 중 재시도 한도를 초과했습니다. ignored=${[...missingColumns].join(',')}; requestTried=${[...triedInThisRequest].join(',')}`);
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (['nan', 'none', 'nat', 'null'].includes(s.toLowerCase())) return '';
  return s.replace(/\s+/g, ' ');
}

function containsAny(text, keywords) {
  const raw = normalizeText(text);
  const low = raw.toLowerCase();
  return keywords.some((kw) => {
    if (!kw) return false;
    return /^[\x00-\x7F]+$/.test(kw) ? low.includes(String(kw).toLowerCase()) : raw.includes(String(kw));
  });
}

// v14: 회수/처분은 단순 부분문자열로 판단하지 않는다.
// 예: '조회수' 안에는 '회수'가 들어가지만 회수 조치가 아니므로 제외해야 한다.
const RECALL_PATTERNS = [
  /자진\s*회수/i, /강제\s*회수/i, /회수\s*(명령|조치|대상|계획|공표|착수|결정|실시|진행|안내)/i,
  /(^|[^조])회수(?!율|량|금|권|차)/i,
  /판매\s*중지/i, /판매중지/i, /판매\s*정지/i, /판매정지/i,
  /사용\s*중지/i, /사용중지/i, /출하\s*중지/i, /출하중지/i,
  /제조[·\s-]*판매\s*중지/i, /잠정\s*(제조|판매)\s*중지/i
];
const DISPOSITION_PATTERNS = [
  /행정\s*처분/i, /영업\s*정지/i, /제조\s*정지/i, /제조업무\s*정지/i,
  /업무\s*정지/i, /판매업무\s*정지/i, /품목\s*정지/i, /품목\s*제조정지/i, /품목\s*판매정지/i,
  /과징금/i, /과태료/i, /처분\s*사전통지/i, /취소\s*처분/i, /행정\s*조치/i
];
const LICENSE_ACTION_PATTERNS = [
  /허가\s*취소/i, /품목허가\s*취소/i, /품목\s*취소/i, /허가\s*정지/i, /품목\s*정지/i, /허가사항\s*직권변경/i
];
const ALL_ACTION_PATTERNS = [...RECALL_PATTERNS, ...DISPOSITION_PATTERNS, ...LICENSE_ACTION_PATTERNS];

function matchesPatterns(text, patterns) {
  const raw = normalizeText(text);
  if (!raw) return false;
  return patterns.some((pattern) => pattern.test(raw));
}

function actionEvidenceText(row) {
  // legacy article_text/article_summary에는 검색식·관련기사 문구가 섞인 경우가 있어 조치성 탭 판단에서는 제외한다.
  return [row.title, row.summary].map(normalizeText).join(' ');
}

function hasActionEvidence(row) {
  return matchesPatterns(actionEvidenceText(row), ALL_ACTION_PATTERNS);
}

function hasActionGroupEvidence(row, groupKey) {
  const text = actionEvidenceText(row);
  if (groupKey === 'recall') return matchesPatterns(text, RECALL_PATTERNS);
  if (groupKey === 'disposition') return matchesPatterns(text, DISPOSITION_PATTERNS);
  if (groupKey === 'license') return matchesPatterns(text, LICENSE_ACTION_PATTERNS);
  return false;
}

function articleText(row) {
  // 분류/레이더 판단에는 RSS 검색식, 기존 category, 기존 keywords를 넣지 않는다.
  // 검색식에 포함된 '회수/처분' 단어 때문에 일반 기사가 회수·처분으로 오분류되는 문제를 막기 위함이다.
  return [row.title, row.summary, row.article_summary, row.article_text, row.source].map(normalizeText).join(' ');
}

function articleEvidenceText(row) {
  return [row.title, row.summary, row.article_summary, row.article_text].map(normalizeText).join(' ');
}

function hasQualitySignal(row) {
  const text = articleEvidenceText(row);
  return containsAny(text, QUALITY_SIGNAL_KEYWORDS);
}

function asBool(value) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  return false;
}

function rowLink(row) {
  return normalizeArticleLink(row?.link || row?.url || row?.article_url || row?.original_link || '');
}

function normalizeTitleForIdentity(title, source = '') {
  let value = normalizeText(title).toLowerCase();
  const src = normalizeText(source).toLowerCase();
  if (src) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`\\s*[-|·]\\s*${escaped}\\s*$`, 'i'), '');
  }
  return value.replace(/[\s\-–—|·,:;\[\](){}<>"'“”‘’]/g, '');
}

function articleIdentityKey(row) {
  const titleKey = normalizeTitleForIdentity(row?.title, row?.source);
  const sourceKey = normalizeText(row?.source).toLowerCase().replace(/\s+/g, '');
  return `${sourceKey}__${titleKey}`;
}

function rowScoreForMerge(row) {
  let score = 0;
  if (rowLink(row)) score += 1000;
  if (normalizeText(row?.summary)) score += 10;
  if (normalizeText(row?.article_summary)) score += 5;
  if (normalizeText(row?.published_at)) score += 1;
  return score;
}

function mergeRowsPreferLink(a, b) {
  const primary = rowScoreForMerge(b) > rowScoreForMerge(a) ? b : a;
  const secondary = primary === b ? a : b;
  return {
    ...secondary,
    ...primary,
    link: rowLink(primary) || rowLink(secondary),
    summary: normalizeText(primary.summary) || normalizeText(secondary.summary),
    article_summary: normalizeText(primary.article_summary) || normalizeText(secondary.article_summary),
    article_text: normalizeText(primary.article_text) || normalizeText(secondary.article_text)
  };
}

function dedupeRowsPreferLink(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = articleIdentityKey(row) || row?.uid || `${row?.title}|${row?.source}`;
    if (!map.has(key)) {
      map.set(key, { ...row, link: rowLink(row) });
    } else {
      map.set(key, mergeRowsPreferLink(map.get(key), row));
    }
  }
  return [...map.values()];
}

function cleanRow(row) {
  const out = {};
  for (const col of ALL_COLUMNS) out[col] = row?.[col] ?? '';
  out.qa_flag = asBool(row?.qa_flag);
  out.published_at = row?.published_at || null;
  out.date = normalizeText(row?.date);
  out.time = normalizeText(row?.time);
  out.link = rowLink(row);
  return normalizeClassificationForRead(out);
}

function isNoiseArticle(row) {
  const title = normalizeText(row?.title);
  const source = normalizeText(row?.source);
  if (!title) return true;
  const low = title.toLowerCase();
  const compact = title.replace(/[\s\-·|_:,]+/g, '');
  const sourceCompact = source.replace(/[\s\-·|_:,]+/g, '');
  if (title.length < 6) return true;
  if (['뉴스', '제약뉴스', '의약뉴스', '데일리팜뉴스', '팜뉴스', '메디칼업저버'].includes(compact)) return true;
  if (sourceCompact && (compact === sourceCompact || compact === `${sourceCompact}뉴스`)) return true;
  if (/^(데일리팜|팜뉴스|약업신문|메디파나뉴스|메디컬투데이|헬스코리아뉴스|의학신문|청년의사|라포르시안)\s*(뉴스)?$/i.test(title)) return true;
  if (/(^|\s)(화촉|부음|부고|인사|동정)(\s|$|\])/.test(title)) return true;
  if (/^(.*?)(\s*[-|·]\s*\1){1,}\s*(뉴스)?$/i.test(title)) return true;
  if (/데일리팜\s*[-|·]\s*데일리팜\s*(뉴스)?\s*[-|·]\s*데일리팜/.test(title)) return true;
  if (low.includes('error') || low.includes('not found')) return true;
  return false;
}

function normalizeClassificationForRead(row) {
  if (!row) return row;
  const recalculated = classifyArticle({
    title: row.title,
    summary: [row.summary, row.article_summary, row.article_text].map(normalizeText).join(' '),
    source: row.source,
    rss_query: ''
  });
  const current = normalizeText(row.category);
  const actionEvidence = hasActionEvidence(row);
  const weakAction = current === '회수/처분' && !actionEvidence;
  const missedAction = current !== '회수/처분' && actionEvidence;
  const weakQuality = current === 'GMP/품질' && !containsAny(articleEvidenceText(row), GMP_KEYWORDS) && !hasQualitySignal(row);

  // v15: 실제 회수/판매중지/행정처분/제조업무정지/품목정지/허가취소 근거가 있으면
  // 과거 캐시에 importance='중간'으로 남아 있어도 화면 조회 시 '높음'으로 강제 보정한다.
  // 예: '제조업무정지 3개월'은 단순 식약처 기사나 허가/임상 기사가 아니라 조치성 기사다.
  if (actionEvidence) {
    row.category = '회수/처분';
    row.importance = '높음';
    row.qa_flag = true;
    row.keywords = normalizeText(recalculated.keywords) || normalizeText(row.keywords);
    return row;
  }

  // 기존 캐시에 v11/v12의 오분류가 남아 있어도 화면 조회 시 보정한다.
  // 특히 '조회수', '부적합', '검출 금지 물질' 같은 단어만으로 회수/처분 처리하지 않는다.
  if (!current || weakAction || missedAction || weakQuality) {
    row.category = recalculated.category;
    row.importance = recalculated.importance;
    row.keywords = recalculated.keywords;
    row.qa_flag = recalculated.qa_flag;
  }

  // 조치성 근거가 없는데 과거 캐시에 회수/처분으로 저장된 행은 보정 결과가 중간/일반일 수 있다.
  // 이때 importance가 과거 값으로 남지 않도록 항상 현재 카테고리 기준으로 정합성을 한 번 더 맞춘다.
  if (normalizeText(row.category) === '회수/처분' && normalizeText(row.importance) !== '높음') {
    row.importance = '높음';
    row.qa_flag = true;
  }
  return row;
}

function parseListParam(value) {
  if (!value || value === '전체') return [];
  return String(value).split(',').map((x) => x.trim()).filter(Boolean).filter((x) => x !== '전체');
}

function ymd(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function daysAgoYmd(days = INITIAL_DAYS) {
  const dt = new Date();
  dt.setDate(dt.getDate() - Number(days) + 1);
  return ymd(dt);
}

function todayYmd() {
  return ymd(new Date());
}

function dateStartIsoKst(value) {
  const v = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return `${v}T00:00:00+09:00`;
}

function dateEndIsoKst(value) {
  const v = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return `${v}T23:59:59+09:00`;
}

function applyBaseFilters(query, params, columns) {
  const startDate = normalizeText(params.startDate);
  const endDate = normalizeText(params.endDate);
  const days = Math.min(Number(params.days || INITIAL_DAYS), CACHE_DAYS);

  let next = query.order('published_at', { ascending: false, nullsFirst: false });
  if (startDate && endDate) {
    next = next.gte('published_at', dateStartIsoKst(startDate)).lte('published_at', dateEndIsoKst(endDate));
  } else {
    next = next.gte('published_at', dateStartIsoKst(daysAgoYmd(days)));
  }

  // category/importance는 기존 캐시 오분류 보정 후 서버 메모리에서 다시 필터링한다.
  // DB 단계에서 필터링하면 과거에 잘못 저장된 '회수/처분' 기사가 계속 섞이거나,
  // 반대로 새 보정 기준에 해당하는 기사를 놓칠 수 있다.
  const sources = parseListParam(params.source);
  if (sources.length) next = next.in('source', sources);

  const keyword = normalizeText(params.q);
  if (keyword) {
    const safe = keyword.replace(/[%_]/g, '');
    const searchable = TEXT_SEARCH_COLUMNS.filter((col) => columns.includes(col));
    if (searchable.length) next = next.or(searchable.map((col) => `${col}.ilike.%${safe}%`).join(','));
  }
  return next;
}

function buildBaseQuery(params, columns, { count = 'exact' } = {}) {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const selected = columns?.length ? columns.join(',') : activeColumns().join(',');
  let query = supabase.from('news_articles').select(selected, { count });
  query = applyBaseFilters(query, params, columns || activeColumns());
  return query;
}

function matchesRuntimeFilters(row, params) {
  const categories = parseListParam(params.category);
  const sources = parseListParam(params.source);
  const importances = parseListParam(params.importance);
  if (categories.length && !categories.includes(normalizeText(row.category))) return false;
  if (sources.length && !sources.includes(normalizeText(row.source))) return false;
  if (importances.length && !importances.includes(normalizeText(row.importance))) return false;

  const keyword = normalizeText(params.q);
  if (keyword) {
    const haystack = [row.title, row.summary, row.article_summary, row.article_text, row.source, row.keywords]
      .map(normalizeText).join(' ').toLowerCase();
    if (!haystack.includes(keyword.toLowerCase())) return false;
  }
  return true;
}

async function fetchRowsForStats(params) {
  const pageSize = 1000;
  const maxRows = 10000;
  const rows = [];
  for (let start = 0; start < maxRows; start += pageSize) {
    const end = start + pageSize - 1;
    const { data } = await runWithColumnFallback('fetchRowsForStats', (columns) => buildBaseQuery(params, columns).range(start, end));
    const rawChunk = data || [];
    const chunk = rawChunk
      .map(cleanRow)
      .filter((row) => !isNoiseArticle(row))
      .filter((row) => matchesRuntimeFilters(row, params));
    rows.push(...chunk);
    if (rawChunk.length < pageSize) break;
  }
  return dedupeRowsPreferLink(rows);
}

function countBy(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeText(row[field]) || '기타';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function groupByDateCategory(rows) {
  const map = new Map();
  for (const row of rows) {
    const date = normalizeText(row.date) || (row.published_at ? String(row.published_at).slice(0, 10) : '미상');
    const cat = normalizeText(row.category) || '기타';
    const key = `${date}__${cat}`;
    map.set(key, { date, category: cat, count: (map.get(key)?.count || 0) + 1 });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function isPolicyArticle(row) {
  const text = articleText(row);
  if (normalizeText(row.category) === '정책/가이드라인') return true;
  return containsAny(text, REGULATOR_KEYWORDS) && containsAny(text, POLICY_KEYWORDS);
}

function buildSummary(rows) {
  const total = rows.length;
  if (!total) return ['현재 조회 조건에 해당하는 기사가 없습니다.'];
  const categories = countBy(rows, 'category');
  const top = categories[0];
  const policy = rows.filter(isPolicyArticle).length;
  const recall = rows.filter((r) => hasActionEvidence(r)).length;
  const gmp = rows.filter((r) => normalizeText(r.category) === 'GMP/품질' || containsAny(articleEvidenceText(r), GMP_KEYWORDS)).length;
  const overseas = rows.filter((r) => normalizeText(r.category) === '해외규제' || containsAny(articleText(r), OVERSEAS_KEYWORDS)).length;
  const high = rows.filter((r) => normalizeText(r.importance) === '높음').length;
  const action = rows.filter((r) => hasActionEvidence(r)).length;
  const lines = [`현재 조회 조건 기준 총 ${total.toLocaleString()}건의 기사가 수집·분류되었습니다.`];
  if (top) lines.push(`가장 많이 감지된 카테고리는 ${top.name}이며, ${top.count.toLocaleString()}건(${((top.count / total) * 100).toFixed(1)}%)입니다.`);
  if (high) lines.push(`중요도 높음 기사가 ${high.toLocaleString()}건 있습니다. 회수·처분, GMP/품질, 공식 규제기관 관련 신호를 우선 확인하는 것이 좋습니다.`);
  if (recall || action) lines.push(`회수·판매중지·행정처분성 이슈가 ${Math.max(recall, action).toLocaleString()}건 감지되었습니다. 제품명, 제조번호, 사유, 조치범위 확인이 필요할 수 있습니다.`);
  if (policy) lines.push(`정책/가이드라인성 기사가 ${policy.toLocaleString()}건 감지되었습니다. 공식 게시판 원문 확인이 필요한 기사인지 선별하십시오.`);
  if (gmp) lines.push(`GMP/품질 관련 기사가 ${gmp.toLocaleString()}건 있습니다. 실태조사, 데이터완전성, 제조·품질관리 이슈 여부를 확인하십시오.`);
  if (overseas) lines.push(`해외 규제기관 관련 기사가 ${overseas.toLocaleString()}건 있습니다. FDA·EMA·PMDA·PIC/S 등 공식 출처 확인이 필요할 수 있습니다.`);
  return lines.slice(0, 6);
}

function sortByPriority(rows) {
  const imp = { '높음': 3, '중간': 2, '일반': 1 };
  const cat = { '회수/처분': 9, 'GMP/품질': 8, '식약처/규제': 7, '정책/가이드라인': 6, '해외규제': 5 };
  return [...rows].sort((a, b) => {
    const ia = imp[normalizeText(a.importance)] || 0;
    const ib = imp[normalizeText(b.importance)] || 0;
    if (ib !== ia) return ib - ia;
    const ca = cat[normalizeText(a.category)] || 0;
    const cb = cat[normalizeText(b.category)] || 0;
    if (cb !== ca) return cb - ca;
    return String(b.published_at || '').localeCompare(String(a.published_at || ''));
  });
}

function tokenizeTitle(title) {
  const stop = new Set(['제약', '바이오', '식약처', '의약품', '뉴스', '단독', '속보', '관련', '추진', '공개', '발표', '기자', '헬스', '데일리', '팜뉴스']);
  return normalizeText(title)
    .replace(/[-–—|·,:;\[\](){}<>"'“”‘’]/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !stop.has(x));
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function compactTitle(title) {
  return normalizeText(title).replace(/\s*[-|]\s*[^-|]{2,18}$/g, '').slice(0, 90);
}

function shouldGroup(row) {
  const cat = normalizeText(row.category);
  if (['회수/처분', 'GMP/품질', '정책/가이드라인', '식약처/규제', '해외규제', '허가/임상'].includes(cat)) return true;
  if (normalizeText(row.importance) === '높음') return true;
  const text = articleText(row);
  return hasActionEvidence(row) || containsAny(text, [...GMP_KEYWORDS, ...REGULATOR_KEYWORDS]);
}

function buildIssueGroups(rows) {
  const candidates = sortByPriority(rows.filter(shouldGroup)).slice(0, 800);
  const groups = [];
  for (const row of candidates) {
    const tokens = tokenizeTitle(row.title);
    if (tokens.length < 2) continue;
    let best = null;
    let bestScore = 0;
    for (const group of groups) {
      const score = jaccard(tokens, group.tokens);
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    }
    if (best && bestScore >= 0.42) {
      best.items.push(row);
      best.tokens = [...new Set([...best.tokens, ...tokens])].slice(0, 16);
    } else {
      groups.push({ key: tokens.slice(0, 5).join(' '), tokens, items: [row] });
    }
  }
  return groups
    .filter((group) => group.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 8)
    .map((group) => {
      const uniqueGroupItems = dedupeRowsPreferLink(group.items);
      const items = sortByPriority(uniqueGroupItems).slice(0, 6);
      return {
        key: group.key,
        count: uniqueGroupItems.length,
        representative_title: compactTitle(items[0]?.title || group.key),
        category: normalizeText(items[0]?.category) || '기타',
        importance: normalizeText(items[0]?.importance) || '일반',
        sources: [...new Set(uniqueGroupItems.map((r) => normalizeText(r.source)).filter(Boolean))].slice(0, 5),
        items
      };
    });
}

function buildActionMonitor(rows) {
  const output = ACTION_GROUPS.map((group) => ({ ...group, items: [] }));
  for (const row of rows) {
    for (const group of output) {
      if (hasActionGroupEvidence(row, group.key)) group.items.push(row);
    }
  }
  return output.map((group) => {
    const seen = new Set();
    const unique = [];
    for (const row of sortByPriority(group.items)) {
      const key = articleIdentityKey(row) || row.uid || `${row.title}|${row.source}`;
      if (seen.has(key)) {
        const idx = unique.findIndex((x) => (articleIdentityKey(x) || x.uid || `${x.title}|${x.source}`) === key);
        if (idx >= 0) unique[idx] = mergeRowsPreferLink(unique[idx], row);
        continue;
      }
      seen.add(key);
      unique.push({ ...row, link: rowLink(row) });
    }
    return { ...group, count: unique.length, items: unique.slice(0, 10) };
  });
}

function classifyArticle({ title, summary, source, rss_query }) {
  const content = [title, summary].map(normalizeText).join(' ');
  const text = [title, summary, source].map(normalizeText).join(' ');
  let category = '산업/경영';
  if (matchesPatterns(content, ALL_ACTION_PATTERNS)) category = '회수/처분';
  else if (containsAny(text, POLICY_KEYWORDS) && containsAny(text, REGULATOR_KEYWORDS)) category = '정책/가이드라인';
  else if (containsAny(text, REGULATOR_KEYWORDS)) category = '식약처/규제';
  else if (containsAny(text, OVERSEAS_KEYWORDS)) category = '해외규제';
  else if (containsAny(text, GMP_KEYWORDS) || containsAny(content, QUALITY_SIGNAL_KEYWORDS)) category = 'GMP/품질';
  else if (containsAny(text, CLINICAL_KEYWORDS)) category = '허가/임상';
  else if (containsAny(text, INSURANCE_KEYWORDS)) category = '약가/보험';
  else if (containsAny(text, BUSINESS_KEYWORDS)) category = '산업/경영';

  let importance = '일반';
  if (['회수/처분', 'GMP/품질', '정책/가이드라인', '식약처/규제', '해외규제'].includes(category)) importance = '높음';
  else if (category === '허가/임상' || containsAny(text, ['허가', '임상 3상', '승인', '기술수출'])) importance = '중간';

  const kwPool = [...RECALL_KEYWORDS, ...ACTION_KEYWORDS, ...LICENSE_ACTION_KEYWORDS, ...QUALITY_SIGNAL_KEYWORDS, ...GMP_KEYWORDS, ...POLICY_KEYWORDS, ...REGULATOR_KEYWORDS, ...CLINICAL_KEYWORDS, ...INSURANCE_KEYWORDS, ...BUSINESS_KEYWORDS];
  const keywords = [...new Set(kwPool.filter((kw) => containsAny(text, [kw])).slice(0, 12))].join(', ');
  const qa_flag = ['회수/처분', 'GMP/품질', '정책/가이드라인', '식약처/규제', '해외규제'].includes(category);
  return { category, importance, keywords, qa_flag };
}

function decodeXml(value) {
  return normalizeText(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripHtml(value) {
  return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function tagValue(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(re);
  return match ? decodeXml(match[1]) : '';
}

function addDateOperators(query, startDate, endDate) {
  let q = normalizeText(query);
  if (startDate && !/\bafter:/i.test(q)) q += ` after:${startDate}`;
  if (endDate && !/\bbefore:/i.test(q)) {
    const d = new Date(`${endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    q += ` before:${ymd(d)}`;
  }
  return q.trim();
}

function buildGoogleNewsUrl(query, settings = {}) {
  const hl = settings.hl || 'ko';
  const gl = settings.gl || 'KR';
  const ceid = settings.ceid || 'KR:ko';
  const params = new URLSearchParams({ q: query, hl, gl, ceid });
  params.set('_cb', String(Date.now()));
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function kstPartsFromInstant(ms) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds()
  };
}

function instantFromKstParts(p) {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour - 9, p.minute, p.second || 0);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatKstParts(p) {
  const date = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  const timeFull = `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second || 0)}`;
  return { date, time: timeFull.slice(0, 5), published_at: `${date}T${timeFull}+09:00` };
}

function parseNewsDate(pubDate, collectedMs = Date.now()) {
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return formatKstParts(kstPartsFromInstant(collectedMs));

  const utcParts = {
    year: parsed.getUTCFullYear(), month: parsed.getUTCMonth() + 1, day: parsed.getUTCDate(),
    hour: parsed.getUTCHours(), minute: parsed.getUTCMinutes(), second: parsed.getUTCSeconds()
  };
  const candidateA = { ms: parsed.getTime(), parts: kstPartsFromInstant(parsed.getTime()) };
  const candidateB = { ms: instantFromKstParts(utcParts), parts: utcParts };
  const tolerance = collectedMs + 30 * 60 * 1000;
  const plausible = [candidateA, candidateB].filter((x) => x.ms <= tolerance);
  const chosen = plausible.length ? plausible.sort((a, b) => b.ms - a.ms)[0] : [candidateA, candidateB].sort((a, b) => a.ms - b.ms)[0];
  return formatKstParts(chosen.parts);
}

function sourceFromItem(item, title) {
  const sourceTag = tagValue(item, 'source');
  if (sourceTag) return stripHtml(sourceTag);
  const cleanTitle = stripHtml(title);
  const parts = cleanTitle.split(' - ');
  if (parts.length >= 2) return parts.at(-1).trim();
  return 'Google News';
}

function normalizeArticleTitle(rawTitle, source) {
  let title = stripHtml(rawTitle);
  const src = normalizeText(source);
  if (src) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`\\s*[-|·]\\s*${escaped}\\s*$`, 'i'), '');
    title = title.replace(new RegExp(`^${escaped}\\s*[-|·]\\s*`, 'i'), '');
    title = title.replace(new RegExp(`\\s*[-|·]\\s*${escaped}\\s*뉴스\\s*$`, 'i'), '');
  }
  title = title.replace(/\s*[-|·]\s*Google News\s*$/i, '');
  title = title.replace(/\s+/g, ' ').trim();
  return title;
}

function normalizeArticleLink(rawLink) {
  const link = normalizeText(rawLink);
  if (!link) return '';
  try {
    const url = new URL(link);
    const direct = url.searchParams.get('url') || url.searchParams.get('u');
    if (direct && /^https?:\/\//i.test(direct)) return direct;
  } catch (_error) {
    return link;
  }
  return link;
}

function makeUid(title, source, publishedAt) {
  const raw = `${normalizeText(title)}|${normalizeText(source)}|${String(publishedAt).slice(0, 10)}`.toLowerCase();
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 18);
}

async function fetchText(url, timeoutSec = 12) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cache-Control': 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function collectGoogleNews({ startDate, endDate, maxItemsPerQuery }) {
  if (!fs.existsSync(RSS_CONFIG_PATH)) throw new Error(`RSS 설정 파일을 찾을 수 없습니다: ${RSS_CONFIG_PATH}`);
  const config = JSON.parse(fs.readFileSync(RSS_CONFIG_PATH, 'utf8'));
  const settings = config.settings || {};
  const maxItems = Math.max(10, Math.min(150, Number(maxItemsPerQuery || settings.max_items_per_query || 80)));
  const timeoutSec = Math.max(5, Math.min(30, Number(settings.timeout_sec || 12)));
  const collected = formatKstParts(kstPartsFromInstant(Date.now()));
  const collectedAt = `${collected.date}T${collected.time}:00+09:00`;
  const rows = [];
  const errors = [];

  for (const entry of config.queries || []) {
    if (entry.enabled === false) continue;
    const queryName = entry.name || 'RSS Query';
    const query = addDateOperators(entry.query || '', startDate, endDate);
    if (!query) continue;
    const url = buildGoogleNewsUrl(query, settings);
    try {
      const xml = await fetchText(url, timeoutSec);
      const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0]).slice(0, maxItems);
      for (const item of items) {
        const rawTitle = tagValue(item, 'title');
        const summary = stripHtml(tagValue(item, 'description'));
        const source = sourceFromItem(item, rawTitle);
        const title = normalizeArticleTitle(rawTitle, source);
        const link = normalizeArticleLink(tagValue(item, 'link') || tagValue(item, 'guid'));
        if (!title || isNoiseArticle({ title, source, summary })) continue;
        const parsed = parseNewsDate(tagValue(item, 'pubDate') || tagValue(item, 'updated'), Date.now());
        const rss_query = query;
        const cls = classifyArticle({ title, summary, source, rss_query });
        const uid = makeUid(title, source, parsed.published_at);
        rows.push({
          uid,
          published_at: parsed.published_at,
          date: parsed.date,
          time: parsed.time,
          source,
          category: cls.category,
          keywords: cls.keywords,
          importance: cls.importance,
          qa_flag: cls.qa_flag,
          title,
          summary,
          link,
          rss_query_name: queryName,
          rss_query,
          collected_at: collectedAt,
          cache_updated_at: collectedAt
        });
      }
    } catch (error) {
      errors.push(`${queryName}: ${error.message || String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const map = new Map();
  for (const row of rows) {
    const key = articleIdentityKey(row) || row.uid;
    if (!map.has(key)) map.set(key, row);
    else map.set(key, mergeRowsPreferLink(map.get(key), row));
  }
  const out = [...map.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  return { rows: out, errors, collectedAt };
}

async function upsertArticles(records) {
  if (!supabase) throw new Error('Supabase client is not configured.');
  let work = records.map((r) => ({ ...r }));
  const ignored = new Set();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase.from('news_articles').upsert(work, { onConflict: 'uid' });
    if (!error) return { count: work.length, ignored: [...ignored] };
    const missing = missingColumnFromError(error);
    if (missing) {
      ignored.add(missing);
      missingColumns.add(missing);
      work = work.map((rec) => {
        const next = { ...rec };
        delete next[missing];
        return next;
      });
      console.warn(`[collect fallback] news_articles column '${missing}' is missing. Retrying upsert without it.`);
      continue;
    }
    throw error;
  }
  throw new Error(`news_articles upsert 재시도 한도를 초과했습니다. ignored=${[...ignored].join(',')}`);
}

async function writeCollectionLog(status, addedCount = 0, totalCount = 0, errorMessage = '') {
  if (!supabase) return;
  const now = formatKstParts(kstPartsFromInstant(Date.now()));
  const rec = {
    id: 'latest',
    status,
    added_count: Number(addedCount || 0),
    total_count: Number(totalCount || 0),
    error_message: String(errorMessage || '').slice(0, 1000),
    collected_at: `${now.date}T${now.time}:00+09:00`
  };
  try {
    await supabase.from('collection_log').upsert(rec, { onConflict: 'id' });
  } catch (error) {
    console.warn(`[collection_log] ${error.message || String(error)}`);
  }
}

const app = express();
const allowedOrigins = CORS_ORIGIN.split(',').map((x) => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true);
  }
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pharma-news-pwa-api',
    supabase: Boolean(supabase),
    cacheDays: CACHE_DAYS,
    initialDays: INITIAL_DAYS,
    apiVersion: API_VERSION,
    activeColumns: activeColumns(),
    ignoredMissingColumns: [...missingColumns]
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    regulatoryDashboardUrl: REGULATORY_DASHBOARD_URL,
    apiVersion: API_VERSION
  });
});

app.get('/api/news', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(150, Math.max(10, Number(req.query.pageSize || 50)));
    const start = (page - 1) * pageSize;
    const rows = await fetchRowsForStats(req.query);
    res.json({ rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize });
  } catch (error) {
    console.error('[GET /api/news]', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const rows = await fetchRowsForStats(req.query);
    const categories = countBy(rows, 'category');
    const sources = countBy(rows, 'source');
    const importances = countBy(rows, 'importance');
    res.json({
      total: rows.length,
      categories,
      sources,
      importances,
      trend: groupByDateCategory(rows),
      summary: buildSummary(rows),
      mainNews: sortByPriority(rows).slice(0, 6),
      issueGroups: buildIssueGroups(rows),
      actionMonitor: buildActionMonitor(rows)
    });
  } catch (error) {
    console.error('[GET /api/stats]', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.get('/api/options', async (req, res) => {
  try {
    const rows = await fetchRowsForStats({ ...req.query, days: req.query.days || CACHE_DAYS });
    res.json({
      categories: countBy(rows, 'category').map((x) => x.name),
      sources: countBy(rows, 'source').map((x) => x.name),
      importances: countBy(rows, 'importance').map((x) => x.name)
    });
  } catch (error) {
    console.error('[GET /api/options]', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.get('/api/collection-log', async (_req, res) => {
  try {
    if (!supabase) throw new Error('Supabase client is not configured.');
    const { data, error } = await supabase.from('collection_log').select('*').order('collected_at', { ascending: false }).limit(1);
    if (error) throw error;
    res.json({ latest: data?.[0] || null });
  } catch (error) {
    console.error('[GET /api/collection-log]', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post('/api/collect', async (req, res) => {
  try {
    const body = req.body || {};
    const collectDays = Math.max(1, Math.min(30, Number(body.collectDays || body.days || INITIAL_DAYS)));
    const endDate = normalizeText(body.endDate) || todayYmd();
    const startDate = normalizeText(body.startDate) || daysAgoYmd(collectDays);
    const maxItemsPerQuery = Math.max(20, Math.min(150, Number(body.maxItemsPerQuery || 80)));
    await writeCollectionLog('running', 0, 0, '');
    const collected = await collectGoogleNews({ startDate, endDate, maxItemsPerQuery });
    const { count, ignored } = collected.rows.length ? await upsertArticles(collected.rows) : { count: 0, ignored: [] };
    await writeCollectionLog(collected.errors.length ? 'partial_success' : 'success', count, collected.rows.length, collected.errors.join('\n'));
    res.json({
      ok: true,
      apiVersion: API_VERSION,
      startDate,
      endDate,
      maxItemsPerQuery,
      collected: collected.rows.length,
      upserted: count,
      ignoredColumns: ignored,
      errors: collected.errors.slice(0, 20)
    });
  } catch (error) {
    console.error('[POST /api/collect]', error);
    await writeCollectionLog('error', 0, 0, error.message || String(error));
    res.status(500).json({ error: error.message || String(error) });
  }
});


if (fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Pharma News PWA API listening on http://${HOST}:${PORT}`);
  console.log(`Supabase configured: ${Boolean(supabase)}`);
  console.log(`Cache days: ${CACHE_DAYS}, initial days: ${INITIAL_DAYS}`);
  console.log(`API version: ${API_VERSION}`);
  console.log(`RSS config: ${RSS_CONFIG_PATH}`);
  console.log(`Regulatory dashboard URL configured: ${Boolean(REGULATORY_DASHBOARD_URL)}`);
  console.log(`Client dist serving: ${fs.existsSync(CLIENT_DIST_DIR) ? CLIENT_DIST_DIR : 'not built'}`);
  console.log(`Initial selected columns: ${ALL_COLUMNS.join(',')}`);
});
