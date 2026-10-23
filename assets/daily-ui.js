(() => {
  'use strict';
  const script = document.currentScript;
  const base = new URL('../', script.src);
  const select = document.getElementById('adi-history');
  const feedback = document.getElementById('adi-feedback');
  const labels = { A: '有新增', B: '重要更新', C: '无新增' };
  let entries = [], current = document.body.dataset.adiDate, pending, observer;
  const setFeedback = text => { feedback.textContent = text; };
  const entryFor = date => entries.find(entry => entry.date === date);
  const requestedDate = () => new URL(location.href).searchParams.get('date') || location.pathname.match(/Amazon_Daily_Intelligence_(\d{4}-\d{2}-\d{2})\.html$/)?.[1] || entries[0]?.date;
  const historyEligible = entry => entry.status === 'A' && Number.isInteger(entry.selected_count) && entry.selected_count > 0;
  const historyLabel = entry => {
    const date = `${entry.date.slice(5,7)}月${entry.date.slice(8)}日`;
    const title = typeof entry.short_title === 'string' && Array.from(entry.short_title).length >= 8 && Array.from(entry.short_title).length <= 18 ? entry.short_title : null;
    return title ? `${date} · ${title}` : date;
  };
  const syncSelection = () => { select.value = current === entries[0]?.date ? 'latest' : historyEligible(entryFor(current)||{}) ? current : ''; };

  function sections() {
    const title = document.querySelector('.paper h1');
    const match = title?.textContent.match(/^(.*?[|｜]\s*)(\d{4}年\d{1,2}月\d{1,2}日)$/);
    if (match) {
      const date = document.createElement('span');
      date.className = 'adi-title-date';
      date.textContent = match[2];
      title.replaceChildren(document.createTextNode(match[1]), date);
    }
    const nav = document.getElementById('adi-section-nav');
    nav.replaceChildren();
    const headings = [...document.querySelectorAll('.paper > section > h2')];
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `adi-section-${index + 1}`;
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent.replace(/^\s*\d+\s*[｜|、.：:]\s*/, '').trim();
      nav.append(link);
    });
    observer?.disconnect();
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(records => {
        const active = records.find(record => record.isIntersecting);
        if (!active) return;
        [...nav.children].forEach(link => {
          if (link.hash === `#${active.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-150px 0px -55% 0px' });
      headings.forEach(heading => observer.observe(heading));
    }
  }

  function updateChrome(date) {
    const entry = entryFor(date);
    current = date;
    document.body.dataset.adiDate = date;
    const latest = date === entries[0]?.date;
    document.getElementById('adi-mode').textContent = latest ? '最新一期' : '历史简报';
    document.getElementById('adi-date').textContent = date;
    document.getElementById('adi-date').dateTime = date;
    const badge = document.getElementById('adi-status');
    badge.textContent = labels[entry.status];
    badge.dataset.status = entry.status;
    document.getElementById('adi-original').href = new URL(entry.url, base).href;
    syncSelection();
    sections();
  }

  async function show(date, push = false) {
    const entry = entryFor(date);
    if (!entry) {
      setFeedback('未找到该日期的已发布简报，请从历史列表选择。');
      syncSelection();
      return;
    }
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    try {
      if (date !== current) {
        document.querySelector('.paper').setAttribute('aria-busy', 'true');
        setFeedback('正在打开简报…');
        const response = await fetch(new URL(entry.url, base), { signal: controller.signal });
        if (!response.ok) throw new Error('report unavailable');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const paper = doc.querySelector('article.paper');
        if (!paper || !doc.title.includes(`${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`)) throw new Error('invalid report');
        paper.querySelectorAll('script,iframe,object,embed').forEach(element => element.remove());
        document.querySelector('.paper').replaceWith(document.importNode(paper, true));
        document.title = doc.title;
      }
      if (controller.signal.aborted) return;
      updateChrome(date);
      if (push) {
        const url = new URL(base);
        if (date !== entries[0].date) url.searchParams.set('date', date);
        history.pushState({ date }, '', url);
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      setFeedback('');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setFeedback('本期暂时无法加载，可通过“打开本期原页”重试。');
      document.getElementById('adi-original').href = new URL(entry.url, base).href;
      syncSelection();
    } finally {
      if (pending === controller) document.querySelector('.paper').removeAttribute('aria-busy');
    }
  }

  sections();
  fetch(new URL('archive/index.json', base), { cache: 'no-cache' })
    .then(response => { if (!response.ok) throw new Error('index unavailable'); return response.json(); })
    .then(index => {
      if (index.schema_version !== 1 || !Array.isArray(index.reports)) throw new Error('invalid index');
      entries = index.reports.filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && labels[entry.status] && entry.url === `archive/Amazon_Daily_Intelligence_${entry.date}.html`)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (!entries.length || new Set(entries.map(entry => entry.date)).size !== entries.length) throw new Error('empty or duplicate index');
      select.replaceChildren();
      const latest = document.createElement('option');
      latest.value = 'latest';
      latest.textContent = '最新一期';
      select.append(latest);
      const direct = document.createElement('option');
      direct.value = ''; direct.textContent = '历史简报'; direct.disabled = true; direct.hidden = true;
      select.append(direct);
      const group = document.createElement('optgroup');
      group.label = '历史简报';
      entries.filter(historyEligible).forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.date;
        option.textContent = historyLabel(entry);
        group.append(option);
      });
      select.append(group);
      select.disabled = false;
      select.addEventListener('change', () => show(select.value === 'latest' ? entries[0].date : select.value, true));
      window.addEventListener('popstate', () => show(requestedDate()));
      return show(requestedDate());
    })
    .catch(() => {
      select.disabled = true;
      setFeedback('历史目录暂时不可用，当前简报仍可正常阅读。');
    });
})();
