import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, BarChart3, CalendarDays, Check, ChevronDown, Download, ExternalLink, Info, Newspaper, RefreshCw, Search, ShieldCheck, Siren, SlidersHorizontal, Smartphone, WifiOff, X } from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const cache = new Map();
const SNAPSHOT_KEY = 'pharma-news-pwa-last-snapshot-v22';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'news', label: '뉴스목록', icon: Newspaper },
  { key: 'actions', label: '회수·처분 모니터링', mobileLabel: ['회수·처분', '모니터링'], icon: Siren }
];

const categoryColors = {
  '산업/경영': '#f47b20',
  '허가/임상': '#68b545',
  '정책/가이드라인': '#7655d8',
  '식약처/규제': '#0065d8',
  '회수/처분': '#d94d4d',
  'GMP/품질': '#00a6a6',
  '해외규제': '#7b61ff',
  '약가/보험': '#f5ad42',
  '기타': '#94a3b8'
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days) + 1);
  return d.toISOString().slice(0, 10);
}

function queryString(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === '전체') return;
    if (Array.isArray(v)) {
      if (!v.length || v.includes('전체')) return;
      qs.set(k, v.join(','));
      return;
    }
    qs.set(k, v);
  });
  return qs.toString();
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function detectPwaStatus(installPromptAvailable = false) {
  const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '/manifest.webmanifest';
  let manifestOk = false;
  let manifestName = '';
  try {
    const manifestRes = await fetch(manifestHref, { cache: 'no-store' });
    manifestOk = manifestRes.ok;
    if (manifestRes.ok) {
      const manifest = await manifestRes.json().catch(() => null);
      manifestName = manifest?.name || manifest?.short_name || '';
    }
  } catch (_error) {}

  let swRegistered = false;
  let swScope = '';
  let swState = '';
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      swRegistered = Boolean(registration);
      swScope = registration?.scope || '';
      swState = registration?.active?.state || registration?.waiting?.state || registration?.installing?.state || '';
    } catch (_error) {}
  }

  return {
    url: window.location.href,
    isSecureContext: Boolean(window.isSecureContext),
    protocol: window.location.protocol,
    host: window.location.host,
    online: navigator.onLine,
    standalone: isStandaloneMode(),
    serviceWorkerSupported: 'serviceWorker' in navigator,
    swRegistered,
    swScope,
    swState,
    manifestOk,
    manifestName,
    installPromptAvailable,
    userAgent: navigator.userAgent
  };
}

function getInitialTab() {
  try {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((item) => item.key === tab) ? tab : 'dashboard';
  } catch (_error) {
    return 'dashboard';
  }
}

function saveSnapshot(payload) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
  } catch (_error) {}
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

async function apiGet(path, params = {}, { force = false } = {}) {
  const qs = queryString(params);
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
  if (!force && cache.has(url)) return cache.get(url);
  let res;
  try {
    res = await fetch(url);
  } catch (error) {
    throw new Error(`Node API 연결 실패: ${url} / ${error.message}`);
  }
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      throw new Error(`API 응답이 JSON 형식이 아닙니다: ${url} / ${text.slice(0, 120)}`);
    }
  }
  if (!res.ok) throw new Error(json?.error || `API 오류: ${res.status}`);
  if (json === null) throw new Error(`API 응답이 비어 있습니다: ${url}`);
  cache.set(url, json);
  return json;
}

async function apiPost(path, body = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_error) {
      throw new Error(`API 응답이 JSON 형식이 아닙니다: ${url} / ${text.slice(0, 120)}`);
    }
  }
  if (!res.ok) throw new Error(json?.error || `API 오류: ${res.status}`);
  return json || {};
}

function safeText(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (['nan', 'none', 'nat', 'null'].includes(s.toLowerCase())) return '';
  return s;
}

function fmtDate(row) {
  return safeText(row.date) || (row.published_at ? String(row.published_at).slice(0, 10) : '날짜 없음');
}

function fmtTime(row) {
  return safeText(row.time) || (row.published_at ? String(row.published_at).slice(11, 16) : '');
}

function normalizeMulti(value) {
  if (Array.isArray(value)) return value;
  if (!value || value === '전체') return [];
  return [value];
}

function Tag({ children, type }) {
  return <span className={`tag ${type || ''}`}>{children}</span>;
}

function Header({ log }) {
  const latest = log?.latest?.collected_at ? new Date(log.latest.collected_at).toLocaleString('ko-KR') : '없음';
  return (
    <header className="hero">
      <div>
        <h1>PharmNews &amp; MFDS Dashboard</h1>
        <div className="hero-meta"><CalendarDays size={15} /> 최근 수집: {latest}</div>
      </div>
      <div className="watermark">HANALL BIOPHARMA</div>
    </header>
  );
}

function MultiSelect({ label, value, options = [], onChange }) {
  const selected = normalizeMulti(value);
  const display = selected.length ? `${selected.length}개 선택` : '전체';
  const toggle = (item) => {
    if (!item) return onChange([]);
    const exists = selected.includes(item);
    const next = exists ? selected.filter((x) => x !== item) : [...selected, item];
    onChange(next);
  };
  return (
    <label className="multi-field">
      {label}
      <details className="multi-select">
        <summary><span>{display}</span><b>{selected.length ? selected.join(', ') : '전체'}</b></summary>
        <div className="multi-menu">
          <button type="button" className="clear-chip" onClick={() => onChange([])}>전체로 보기</button>
          {(options || []).map((item) => (
            <label key={item} className="check-row">
              <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </details>
    </label>
  );
}

function InfoPopover({ type }) {
  const isImportance = type === 'importance';
  return (
    <details className="info-popover">
      <summary><Info size={15} /> {isImportance ? '중요도 기준' : '수집범위'}</summary>
      <div className="info-body">
        {isImportance ? (
          <>
            <b>중요도 높음</b>
            <p>회수/처분, GMP/품질, 식약처·FDA·EMA 등 규제기관, 정책/가이드라인성 신호를 우선 표시합니다.</p>
            <b>중요도 중간</b>
            <p>허가·임상·승인·기술수출 등 후속 확인 필요성이 있는 기사입니다.</p>
            <b>일반</b>
            <p>산업/경영, 투자, 매출 등 참고성 기사입니다.</p>
          </>
        ) : (
          <>
            <p>RSS 수집은 Google News RSS 검색식을 기준으로 조회기간의 after/before 조건을 붙여 수행합니다.</p>
            <p>수집 결과는 Supabase <b>news_articles</b>에 upsert되며, 화면 조회는 Supabase 캐시 기준입니다.</p>
            <p>언론사 중복·동일 기사 반복은 uid와 유사 이슈 묶음에서 일부 정리합니다.</p>
          </>
        )}
      </div>
    </details>
  );
}

function FilterFields({ filters, update, options }) {
  const setRecent = (days) => update({ collectDays: days, startDate: daysAgoYmd(days), endDate: todayYmd() });
  return (
    <div className="filter-grid focused">
      <label>
        시작일
        <input type="date" value={filters.startDate} onChange={(e) => update({ startDate: e.target.value })} />
      </label>
      <label>
        종료일
        <input type="date" value={filters.endDate} onChange={(e) => update({ endDate: e.target.value })} />
      </label>
      <MultiSelect label="카테고리" value={filters.category} options={options.categories || []} onChange={(v) => update({ category: v })} />
      <MultiSelect label="언론사" value={filters.source} options={options.sources || []} onChange={(v) => update({ source: v })} />
      <MultiSelect label="중요도" value={filters.importance} options={options.importances?.length ? options.importances : ['높음', '중간', '일반']} onChange={(v) => update({ importance: v })} />
      <label className="search-label">
        검색어
        <div className="search-box"><Search size={16} /><input value={filters.q} placeholder="제목, 키워드, 언론사 검색" onChange={(e) => update({ q: e.target.value })} /></div>
      </label>
      <label>
        빠른 기간
        <select value={filters.collectDays} onChange={(e) => setRecent(Number(e.target.value))}>
          <option value={3}>최근 3일</option>
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
        </select>
      </label>
      <label>
        쿼리당 수집
        <select value={filters.maxItemsPerQuery} onChange={(e) => update({ maxItemsPerQuery: Number(e.target.value) })}>
          <option value={50}>50건/식</option>
          <option value={80}>80건/식</option>
          <option value={100}>100건/식</option>
          <option value={150}>150건/식</option>
        </select>
      </label>
    </div>
  );
}

function resetFilterValues() {
  return {
    startDate: daysAgoYmd(7),
    endDate: todayYmd(),
    collectDays: 7,
    category: [],
    source: [],
    importance: [],
    q: '',
    maxItemsPerQuery: 100
  };
}

function filterSummary(filters) {
  const parts = [];
  parts.push(`${filters.startDate || '-'} ~ ${filters.endDate || '-'}`);
  const catCount = normalizeMulti(filters.category).length;
  const sourceCount = normalizeMulti(filters.source).length;
  const importanceCount = normalizeMulti(filters.importance).length;
  if (catCount) parts.push(`카테고리 ${catCount}`);
  if (sourceCount) parts.push(`언론사 ${sourceCount}`);
  if (importanceCount) parts.push(`중요도 ${importanceCount}`);
  if (safeText(filters.q)) parts.push(`검색어: ${safeText(filters.q)}`);
  return parts.join(' · ');
}

function Filters({ filters, setFilters, options, onCollect, collecting }) {
  const update = (patch) => setFilters((prev) => ({ ...prev, page: 1, ...patch }));
  return (
    <section className="filters card desktop-filters">
      <div className="filter-title">조회조건</div>
      <FilterFields filters={filters} update={update} options={options} />
      <div className="filter-actions">
        <button className="collect-btn" onClick={onCollect} disabled={collecting}>
          <RefreshCw size={18} className={collecting ? 'spin' : ''} /> {collecting ? 'RSS 수집 중' : 'RSS 수집'}
        </button>
        <InfoPopover type="importance" />
        <InfoPopover type="scope" />
      </div>
    </section>
  );
}

function MobileQueryBar({ filters, setFilters, options, onCollect, collecting }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  const openSheet = () => {
    setDraft(filters);
    setOpen(true);
  };
  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, page: 1, ...patch }));
  const applyDraft = () => {
    setFilters((prev) => ({ ...prev, ...draft, page: 1 }));
    setOpen(false);
  };
  const resetDraft = () => setDraft((prev) => ({ ...prev, ...resetFilterValues(), page: 1 }));

  return (
    <>
      <section className="mobile-query-bar card">
        <div className="mobile-query-summary">
          <b>조회조건</b>
          <span>{filterSummary(filters)}</span>
        </div>
        <div className="mobile-query-actions">
          <button type="button" className="mobile-filter-btn" onClick={openSheet}><SlidersHorizontal size={17} /> 조회조건</button>
          <button type="button" className="mobile-collect-btn" onClick={onCollect} disabled={collecting}><RefreshCw size={17} className={collecting ? 'spin' : ''} /> {collecting ? '수집 중' : 'RSS 수집'}</button>
        </div>
      </section>
      {open && (
        <div className="sheet-layer" role="dialog" aria-modal="true" aria-label="조회조건 설정">
          <button type="button" className="sheet-backdrop" aria-label="조회조건 닫기" onClick={() => setOpen(false)} />
          <section className="filter-sheet">
            <div className="sheet-head">
              <div><b>조회조건 설정</b><span>조건을 확인한 뒤 적용하면 화면이 갱신됩니다.</span></div>
              <button type="button" className="sheet-close" onClick={() => setOpen(false)}><X size={19} /></button>
            </div>
            <div className="sheet-body">
              <FilterFields filters={draft} update={updateDraft} options={options} />
              <div className="sheet-info-grid">
                <InfoPopover type="importance" />
                <InfoPopover type="scope" />
              </div>
            </div>
            <div className="sheet-foot">
              <button type="button" className="sheet-reset" onClick={resetDraft}>초기화</button>
              <button type="button" className="sheet-apply" onClick={applyDraft}><Check size={17} /> 적용</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function NavLabel({ item }) {
  if (!item.mobileLabel) return <span className="nav-label nav-label-single">{item.label}</span>;
  return (
    <span className="nav-label nav-label-actions">
      <span className="nav-label-desktop">{item.label}</span>
      <span className="nav-label-mobile">{item.mobileLabel.map((line) => <span key={line}>{line}</span>)}</span>
    </span>
  );
}

function Navigation({ activeTab, setActiveTab, regulatoryDashboardUrl, onInstall, installReady, isStandalone }) {
  const openRegulatory = () => {
    if (regulatoryDashboardUrl) {
      window.open(regulatoryDashboardUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    alert('식약처 대시보드 URL은 아직 연결되지 않았습니다. Render 환경변수 REGULATORY_DASHBOARD_URL 값에 링크를 넣으면 이 버튼에서 열립니다.');
  };
  return (
    <nav className="tab-bar" aria-label="주요 화면">
      {TABS.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.key} className={activeTab === item.key ? 'active' : ''} onClick={() => setActiveTab(item.key)}>
            <Icon size={18} /> <NavLabel item={item} />
          </button>
        );
      })}
      <button className="external-tab" onClick={openRegulatory} title="나중에 별도 React/Node 또는 Streamlit URL 연결 가능">
        <ShieldCheck size={18} /> <span className="external-label"><span className="external-label-desktop">식약처 대시보드</span><span className="external-label-mobile"><span>식약처</span><span>대시보드</span></span></span>
      </button>
      <button className="install-tab desktop-install-tab" onClick={onInstall} title="PC에 앱처럼 설치">
        <Download size={18} /> <span>{isStandalone ? '설치됨' : '앱 설치'}</span>
      </button>
      <button className="install-tab mobile-install-tab" onClick={onInstall} title="모바일/PC 홈 화면 설치">
        <Download size={18} /> <span>{isStandalone ? '설치됨' : '앱 설치'}</span>
      </button>
    </nav>
  );
}

function PwaInstallDialog({ open, onClose, onPromptInstall, installReady, isStandalone }) {
  if (!open) return null;
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;
  const platformTitle = isStandalone
    ? '설치 상태'
    : isIOS
      ? 'iPhone / iPad 설치'
      : isAndroid
        ? 'Android 설치'
        : 'PC 설치';
  return (
    <div className="pwa-dialog-layer" role="dialog" aria-modal="true" aria-label="앱 설치 안내">
      <button type="button" className="pwa-dialog-backdrop" aria-label="닫기" onClick={onClose} />
      <section className="pwa-dialog card simple-install-dialog mobile-install-dialog">
        <div className="pwa-dialog-head">
          <div>
            <b>앱 설치 안내</b>
            <span>PC와 모바일에서 브라우저 주소창 없이 앱처럼 실행할 수 있습니다.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>
        <div className="pwa-help simple-install-help mobile-install-help">
          {isStandalone ? (
            <p><b>이미 앱 모드로 실행 중입니다.</b></p>
          ) : (
            <>
              <h4>{platformTitle}</h4>
              {isDesktop && (
                <ol>
                  <li><b>Chrome 또는 Edge</b>에서 현재 배포 주소를 엽니다.</li>
                  <li>주소창 오른쪽의 <b>설치 아이콘</b>을 누르거나, 브라우저 <b>⋯ 메뉴</b>에서 앱 설치 항목을 선택합니다.</li>
                  <li>설치 후 시작 메뉴, 작업표시줄, 바탕화면 바로가기에서 앱처럼 실행할 수 있습니다.</li>
                </ol>
              )}
              {isAndroid && (
                <ol>
                  <li><b>Chrome</b>에서 배포 주소를 엽니다.</li>
                  <li>설치창이 뜨면 <b>설치</b>를 누릅니다.</li>
                  <li>설치창이 안 뜨면 우측 상단 <b>⋮</b> 메뉴에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택합니다.</li>
                </ol>
              )}
              {isIOS && (
                <ol>
                  <li>반드시 <b>Safari</b>에서 배포 주소를 엽니다.</li>
                  <li>하단의 <b>공유</b> 버튼을 누릅니다.</li>
                  <li><b>홈 화면에 추가</b>를 선택합니다.</li>
                  <li>추가된 아이콘을 눌러 실행합니다.</li>
                </ol>
              )}
              <div className="mobile-install-split install-split-3">
                <div><b>PC</b><span>Chrome/Edge 주소창 설치 아이콘 또는 ⋯ 메뉴 → 앱 설치</span></div>
                <div><b>Android</b><span>Chrome → 설치창 또는 ⋮ 메뉴 → 앱 설치/홈 화면에 추가</span></div>
                <div><b>iPhone / iPad</b><span>Safari → 공유 버튼 → 홈 화면에 추가</span></div>
              </div>
              {!installReady && !isIOS && (
                <p className="install-note">설치창이 바로 열리지 않으면 브라우저 주소창의 설치 아이콘 또는 메뉴에서 설치하십시오. 이미 설치되어 있거나 브라우저가 아직 설치 조건을 판단 중이면 버튼이 표시되지 않을 수 있습니다.</p>
              )}
              {isIOS && (
                <p className="install-note">iOS는 웹페이지 안에서 설치창을 직접 띄우는 방식이 제한되므로 Safari 공유 메뉴를 사용합니다.</p>
              )}
              {installReady && !isIOS && (
                <p className="install-note">설치창이 준비된 경우 아래 버튼으로 바로 설치창을 열 수 있습니다.</p>
              )}
            </>
          )}
        </div>
        <div className="pwa-dialog-actions simple-install-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>닫기</button>
          {!isStandalone && !isIOS && installReady && (
            <button type="button" className="primary-btn" onClick={onPromptInstall}>설치창 열기</button>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="kpi card">
      <span style={{ background: color || '#0065d8' }} />
      <div>
        <p>{label}</p>
        <b>{value}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function MobileFoldPanel({ title, children, className = '', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`card panel mobile-fold-panel ${className} ${open ? 'open' : ''}`}>
      <button type="button" className="fold-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <h2>{title}</h2>
        <ChevronDown size={18} className="fold-icon" />
      </button>
      <div className="fold-content">{children}</div>
    </section>
  );
}

function CategoryBars({ categories = [], limit = 7 }) {
  const top = categories.slice(0, limit);
  const max = Math.max(1, ...top.map((x) => x.count));
  const total = categories.reduce((sum, x) => sum + x.count, 0) || 1;
  return (
    <div className="bar-list">
      {top.map((item) => {
        const color = categoryColors[item.name] || categoryColors['기타'];
        return (
          <div className="bar-row" key={item.name}>
            <span className="bar-label">{item.name}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(item.count / max) * 100}%`, background: color }} /></div>
            <span className="bar-value">{item.count}건 ({((item.count / total) * 100).toFixed(1)}%)</span>
          </div>
        );
      })}
    </div>
  );
}

function NewsCard({ row, compact = false }) {
  const cat = safeText(row.category) || '기타';
  const title = safeText(row.title);
  const link = safeText(row.link);
  const impClass = row.importance === '높음' ? 'high' : row.importance === '중간' ? 'mid' : 'normal';
  return (
    <article className={`news-card ${compact ? 'compact' : ''}`}>
      <div className="news-meta">
        <b>{safeText(row.source)}</b>
        <span>{fmtDate(row)} {fmtTime(row)}</span>
        <Tag>{cat}</Tag>
        {row.importance && <Tag type={impClass}>중요도 {row.importance}</Tag>}
      </div>
      <h3>{link ? <a className="news-title-link" href={link} target="_blank" rel="noreferrer">{title} <ExternalLink size={13} /></a> : title}</h3>
      {!compact && safeText(row.summary) && <p className="summary">{safeText(row.summary)}</p>}
      <div className="card-actions">
        {link ? <a href={link} target="_blank" rel="noreferrer">원문 열기 <ExternalLink size={14} /></a> : <span className="missing">링크 없음 · 재수집 후 복구 가능</span>}
      </div>
    </article>
  );
}

function IssueGroups({ groups = [] }) {
  if (!groups.length) return <p className="empty">유사 이슈로 묶인 기사가 충분하지 않습니다.</p>;
  return (
    <div className="issue-grid detailed">
      {groups.map((g) => {
        const firstLinked = (g.items || []).find((row) => row.link);
        return (
        <div className="issue-card detailed" key={g.key}>
          <div className="issue-card-head">
            {firstLinked ? (
              <a className="issue-title-link" href={firstLinked.link} target="_blank" rel="noreferrer">{g.representative_title} <ExternalLink size={13} /></a>
            ) : (
              <b>{g.representative_title}</b>
            )}
            <Tag type={g.importance === '높음' ? 'high' : g.importance === '중간' ? 'mid' : ''}>{g.count}건 · {g.category}</Tag>
          </div>
          <p className="issue-source">언론사: {g.sources?.join(', ') || '미상'}</p>
          <ul className="issue-links">
            {(g.items || []).map((row) => (
              <li key={row.uid || row.link || row.title}>
                {row.link ? <a href={row.link} target="_blank" rel="noreferrer">{safeText(row.source)} · {safeText(row.title)} <ExternalLink size={13} /></a> : <span>{safeText(row.source)} · {safeText(row.title)}</span>}
              </li>
            ))}
          </ul>
        </div>
        );
      })}
    </div>
  );
}

function Dashboard({ stats }) {
  const catMap = Object.fromEntries((stats.categories || []).map((x) => [x.name, x.count]));
  const actionTotal = (stats.actionMonitor || []).reduce((sum, x) => sum + (x.count || 0), 0);
  return (
    <div className="space">
      <div className="kpi-grid">
        <Kpi label="전체 기사" value={`${(stats.total || 0).toLocaleString()}건`} color="#081f3f" />
        <Kpi label="회수/처분" value={`${(catMap['회수/처분'] || 0).toLocaleString()}건`} color="#d94d4d" />
        <Kpi label="GMP/품질" value={`${(catMap['GMP/품질'] || 0).toLocaleString()}건`} color="#00a6a6" />
        <Kpi label="조치성 신호" value={`${actionTotal.toLocaleString()}건`} sub="중복 포함" color="#ef4444" />
      </div>
      <div className="two-col">
        <MobileFoldPanel title="중요 이슈 요약" className="issue-summary">
          <ul className="summary-list">{(stats.summary || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </MobileFoldPanel>
        <MobileFoldPanel title="카테고리 분포" className="category-distribution-panel">
          <CategoryBars categories={stats.categories || []} />
        </MobileFoldPanel>
      </div>
      <section className="card panel">
        <h2>주요 뉴스</h2>
        <div className="news-grid">{(stats.mainNews || []).slice(0, 6).map((row) => <NewsCard row={row} compact key={row.uid} />)}</div>
      </section>
      <section className="card panel">
        <h2>유사 이슈 묶음</h2>
        <IssueGroups groups={stats.issueGroups || []} />
      </section>
    </div>
  );
}

function NewsTimeline({ news, filters, setFilters }) {
  const totalPages = Math.max(1, Math.ceil((news.total || 0) / filters.pageSize));
  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of news.rows || []) {
      const date = fmtDate(row);
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(row);
    }
    return [...map.entries()];
  }, [news.rows]);
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>뉴스 타임라인</h2>
        <div className="pager-info">총 {(news.total || 0).toLocaleString()}건 · {filters.page}/{totalPages}페이지</div>
      </div>
      <div className="pager-controls">
        <select value={filters.pageSize} onChange={(e) => setFilters((p) => ({ ...p, page: 1, pageSize: Number(e.target.value) }))}>
          <option value={25}>25건/페이지</option>
          <option value={50}>50건/페이지</option>
          <option value={100}>100건/페이지</option>
          <option value={150}>150건/페이지</option>
        </select>
        <button disabled={filters.page <= 1} onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}>이전</button>
        <button disabled={filters.page >= totalPages} onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}>다음</button>
      </div>
      {grouped.map(([date, rows]) => (
        <div className="date-group" key={date}>
          <h3>{date}</h3>
          {rows.map((row) => <div className="timeline-item" key={row.uid}><span className="time">{fmtTime(row)}</span><NewsCard row={row} /></div>)}
        </div>
      ))}
    </section>
  );
}

function ActionMonitor({ stats }) {
  const groups = stats.actionMonitor || [];
  const [selectedKey, setSelectedKey] = useState('');
  const selectedGroup = groups.find((group) => group.key === selectedKey);
  return (
    <div className="space">
      <div className="desktop-action-layout">
        <div className="action-kpi-grid">
          {groups.map((group) => (
            <Kpi key={group.key} label={group.label} value={`${(group.count || 0).toLocaleString()}건`} sub={group.description} color={group.key === 'recall' ? '#d94d4d' : '#ef4444'} />
          ))}
        </div>
        <section className="card panel">
          <h2>회수·처분 모니터링</h2>
          <p className="panel-note">행정처분, 회수, 판매중지, 품목허가 취소·정지 기사만 유형별로 모았습니다. RSS 검색식에 걸린 일반 임상·산업 기사는 제외합니다.</p>
          <div className="action-grid">
            {groups.map((group) => (
              <section className="action-lane" key={group.key}>
                <div className="lane-head"><b>{group.label}</b><span>{group.count}건</span></div>
                {(group.items || []).length === 0 ? <p className="empty small">해당 이슈 없음</p> : (group.items || []).map((row) => <NewsCard row={row} compact key={`${group.key}-${row.uid}`} />)}
              </section>
            ))}
          </div>
        </section>
      </div>
      <section className="card panel mobile-action-layout">
        {!selectedGroup ? (
          <>
            <h2>회수·처분 모니터링</h2>
            <p className="panel-note">유형을 선택하면 해당 기사만 보여줍니다.</p>
            <div className="mobile-action-buttons">
              {groups.map((group) => (
                <button type="button" className="mobile-action-card" key={group.key} onClick={() => setSelectedKey(group.key)}>
                  <span><b>{group.label}</b><small>{group.description}</small></span>
                  <strong>{(group.count || 0).toLocaleString()}건</strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mobile-detail-head">
              <button type="button" onClick={() => setSelectedKey('')}><ArrowLeft size={17} /> 유형 선택</button>
              <span>{selectedGroup.count || 0}건</span>
            </div>
            <h2>{selectedGroup.label}</h2>
            <p className="panel-note">{selectedGroup.description}</p>
            {(selectedGroup.items || []).length === 0 ? <p className="empty small">해당 이슈 없음</p> : (selectedGroup.items || []).map((row) => <NewsCard row={row} compact key={`${selectedGroup.key}-${row.uid}`} />)}
          </>
        )}
      </section>
    </div>
  );
}

function App() {
  const [activeTabState, setActiveTabState] = useState(getInitialTab);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pwaStatus, setPwaStatus] = useState(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [filters, setFilters] = useState({
    startDate: daysAgoYmd(7),
    endDate: todayYmd(),
    collectDays: 7,
    category: [],
    source: [],
    importance: [],
    q: '',
    maxItemsPerQuery: 100,
    page: 1,
    pageSize: 50
  });
  const [options, setOptions] = useState({ categories: [], sources: [], importances: [] });
  const [stats, setStats] = useState(null);
  const [news, setNews] = useState({ rows: [], total: 0, page: 1, pageSize: 50 });
  const [log, setLog] = useState(null);
  const [config, setConfig] = useState({ regulatoryDashboardUrl: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const setActiveTab = (key) => {
    setActiveTabState(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', key);
      window.history.replaceState(null, '', url);
    } catch (_error) {}
  };
  const activeTab = activeTabState;

  const queryParams = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    category: filters.category,
    source: filters.source,
    importance: filters.importance,
    q: filters.q
  };

  const reloadAll = async ({ force = false } = {}) => {
    const [s, n, l] = await Promise.all([
      apiGet('/api/stats', queryParams, { force }),
      apiGet('/api/news', { ...queryParams, page: filters.page, pageSize: filters.pageSize }, { force }),
      apiGet('/api/collection-log', {}, { force }).catch(() => null)
    ]);
    setStats(s);
    setNews(n);
    saveSnapshot({ stats: s, news: n, filters: queryParams });
    if (l) setLog(l);
  };

  const handleCollect = async () => {
    setCollecting(true);
    setError('');
    setNotice('');
    try {
      const result = await apiPost('/api/collect', {
        startDate: filters.startDate,
        endDate: filters.endDate,
        collectDays: filters.collectDays,
        maxItemsPerQuery: filters.maxItemsPerQuery
      });
      cache.clear();
      setNotice(`RSS 수집 완료: 수집 ${result.collected?.toLocaleString?.() || result.collected || 0}건, 저장 ${result.upserted?.toLocaleString?.() || result.upserted || 0}건${result.errors?.length ? ` / 일부 오류 ${result.errors.length}건` : ''}`);
      await Promise.all([
        apiGet('/api/options', { startDate: filters.startDate, endDate: filters.endDate }, { force: true }).then(setOptions),
        reloadAll({ force: true })
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setCollecting(false);
    }
  };

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setTimeout(() => detectPwaStatus(true).then(setPwaStatus).catch(() => {}), 0);
    };
    const updateOnline = () => setIsOffline(!navigator.onLine);
    const updateStandalone = () => setIsStandalone(isStandaloneMode());
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', updateStandalone);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', updateStandalone);

    if ('serviceWorker' in navigator) {
      if (import.meta.env.PROD) {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
          const markWaiting = () => registration.waiting && setUpdateReady(true);
          markWaiting();
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
            });
          });
        }).catch(() => {});
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
      } else {
        navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((reg) => reg.unregister())).catch(() => {});
        if ('caches' in window) {
          caches.keys().then((keys) => keys.filter((key) => key.startsWith('pharma-news-pwa')).forEach((key) => caches.delete(key))).catch(() => {});
        }
      }
    }

    detectPwaStatus(Boolean(installPrompt)).then(setPwaStatus).catch(() => {});

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', updateStandalone);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const refreshPwaStatus = async () => {
    const status = await detectPwaStatus(Boolean(installPrompt));
    setPwaStatus(status);
    return status;
  };

  const openInstallHelp = async () => {
    await refreshPwaStatus();
    setInstallHelpOpen(true);
  };

  const runInstallPrompt = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setTimeout(() => refreshPwaStatus(), 400);
    return true;
  };

  const resetPwaCache = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('pharma-news-pwa')).map((key) => caches.delete(key)));
      }
      localStorage.removeItem(SNAPSHOT_KEY);
      const registration = await navigator.serviceWorker?.getRegistration?.();
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch (_error) {}
    window.location.reload();
  };

  const handleInstall = async () => {
    if (isStandalone) {
      alert('이미 앱 모드로 실행 중입니다.');
      return;
    }
    if (!installPrompt) {
      await openInstallHelp();
      return;
    }
    await runInstallPrompt();
  };

  const applyUpdate = async () => {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  useEffect(() => {
    apiGet('/api/config').then(setConfig).catch(() => {});
    apiGet('/api/options', { startDate: daysAgoYmd(30), endDate: todayYmd() }).then(setOptions).catch((e) => setError(e.message));
    apiGet('/api/collection-log').then(setLog).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!isOffline) setNotice('');
    Promise.all([
      apiGet('/api/stats', queryParams),
      apiGet('/api/news', { ...queryParams, page: filters.page, pageSize: filters.pageSize })
    ]).then(([s, n]) => {
      if (!cancelled) {
        setStats(s);
        setNews(n);
        saveSnapshot({ stats: s, news: n, filters: queryParams });
      }
    }).catch((e) => {
      if (cancelled) return;
      const snapshot = loadSnapshot();
      if (snapshot?.stats && snapshot?.news) {
        setStats(snapshot.stats);
        setNews(snapshot.news);
        setNotice(`API 연결 실패로 최근 성공 조회 스냅샷을 표시합니다. 저장시각: ${new Date(snapshot.savedAt).toLocaleString('ko-KR')}`);
      } else {
        setError(e.message);
      }
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters.startDate, filters.endDate, filters.category, filters.source, filters.importance, filters.q, filters.page, filters.pageSize, isOffline]);

  return (
    <div className="app">
      <Header log={log} isOffline={isOffline} isStandalone={isStandalone} />
      <MobileQueryBar filters={filters} setFilters={setFilters} options={options} onCollect={handleCollect} collecting={collecting} />
      <Filters filters={filters} setFilters={setFilters} options={options} onCollect={handleCollect} collecting={collecting} />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} regulatoryDashboardUrl={config.regulatoryDashboardUrl} onInstall={handleInstall} installReady={Boolean(installPrompt)} isStandalone={isStandalone} />
      <PwaInstallDialog open={installHelpOpen} onClose={() => setInstallHelpOpen(false)} onPromptInstall={runInstallPrompt} installReady={Boolean(installPrompt)} isStandalone={isStandalone} />
      {isOffline && <div className="offline-banner"><WifiOff size={16} /> 현재 오프라인입니다. 마지막 성공 조회 스냅샷이 있으면 해당 데이터를 표시합니다.</div>}
      {updateReady && <div className="update-banner">새 버전이 준비되었습니다. <button onClick={applyUpdate}>새로고침 적용</button></div>}
      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {loading && <div className="loading">데이터를 불러오는 중입니다...</div>}
      {!stats ? <div className="empty card">Supabase 캐시 데이터를 기다리는 중입니다.</div> : (
        <main>
          {activeTab === 'dashboard' && <Dashboard stats={stats} />}
          {activeTab === 'news' && <NewsTimeline news={news} filters={filters} setFilters={setFilters} />}
          {activeTab === 'actions' && <ActionMonitor stats={stats} />}
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
