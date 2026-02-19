/*
  Search overlay for the textbook.
  - Works with Jekyll baseurl
  - Works even when toc_split.html itself is NOT under /it/ or /en/
    (language is inferred from the iframe src or ?load=...)
  - Renders inline LaTeX using KaTeX (via window.katex, already loaded by kg)
*/

(function () {
  'use strict';

  // -------- helpers (baseurl + language) --------

  function inferBaseUrlFromThisScript() {
    const scripts = Array.from(document.scripts || []);
    const me = scripts.find(s => typeof s.src === 'string' && /\/static\/js\/search\.js(\?|$)/.test(s.src));
    if (!me) return '';
    try {
      const p = new URL(me.src, window.location.href).pathname;
      return p.replace(/\/static\/js\/search\.js.*$/, '');
    } catch {
      return '';
    }
  }

  function normalizeBase(base) {
    if (!base) return '';
    if (!base.startsWith('/')) base = '/' + base;
    return base.replace(/\/$/, '');
  }

  function getContentPathHint() {
    try {
      const u = new URL(window.location.href);
      const load = u.searchParams.get('load');
      if (load) return load;
    } catch {}

    const frame = document.getElementById('toc-split-frame');
    if (frame && frame.getAttribute('src')) return frame.getAttribute('src');

    return '';
  }

  function inferLang() {
    const hint = getContentPathHint();
    if (/\/(en)\//.test(hint)) return 'en';
    if (/\/(it)\//.test(hint)) return 'it';

    const htmlLang = (document.documentElement && document.documentElement.lang) ? document.documentElement.lang.toLowerCase() : '';
    if (htmlLang.startsWith('en')) return 'en';
    return 'it';
  }

  function joinPath(a, b) {
    const aa = (a || '').replace(/\/$/, '');
    const bb = (b || '').replace(/^\//, '');
    if (!aa) return '/' + bb;
    return aa + '/' + bb;
  }

  function getIndexUrl() {
    const base = normalizeBase(inferBaseUrlFromThisScript());
    const lang = inferLang();
    return joinPath(base, `${lang}/search.json`);
  }

  function getBasePath() {
    return normalizeBase(inferBaseUrlFromThisScript());
  }

  function pickKatex() {
    if (window.katex) return window.katex;
    const frame = document.getElementById('toc-split-frame');
    try {
      const k = frame && frame.contentWindow && frame.contentWindow.katex;
      if (k) return k;
    } catch (_) {}
    return null;
  }

  function ensureKatexLoaded() {
    return new Promise((resolve) => {
      const k0 = pickKatex();
      if (k0) return resolve(k0);

      const base = getBasePath();
      const kgSrc = joinPath(base, 'static/js/kg.0.3.1.js');

      if (document.querySelector('script[data-search-katex="1"]')) {
        return resolve(pickKatex());
      }

      const s = document.createElement('script');
      s.src = kgSrc;
      s.async = true;
      s.defer = true;
      s.dataset.searchKatex = '1';
      s.onload = () => resolve(pickKatex());
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  function toAbsoluteBookUrl(relativeUrl) {
    if (!relativeUrl) return relativeUrl;
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

    const base = getBasePath();
    const rel = (relativeUrl || '').startsWith('/') ? relativeUrl : '/' + relativeUrl;

    if (base && (rel === base || rel.startsWith(base + '/'))) {
      return rel;
    }
    return base ? (base + rel) : rel;
  }

  // -------- helpers (text cleaning + KaTeX) --------

  function stripLiquidAndNoise(text) {
    if (!text) return '';

    // 1) rimuovi costrutti liquid/jekyll
    text = text.replace(/\{\%[\s\S]*?\%\}/g, ' ');
    text = text.replace(/\{\{[\s\S]*?\}\}/g, ' ');

    // 1bis) Collassa le "display equations" salvate come \( \begin{gathered}...\end{gathered} \)
    //       o \( \begin{aligned}...\end{aligned} \) (e anche le versioni \[ ... \]) in un semplice separatore.
    //       Così in search results non compaiono \begin{gathered}/\end{gathered}, che sono lunghi e "brutti".
    text = text.replace(
      /\\\(\s*\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}\s*\\\)/g,
      ' … '
    );
    text = text.replace(
      /\\\[\s*\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}\s*\\\]/g,
      ' … '
    );

    // (opzionale ma utile) Se mai compaiono senza \( \) / \[ \], collassa anche queste:
    text = text.replace(
      /\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}/g,
      ' … '
    );

    // 1ter) Collassa SEMPRE le display equations $$...$$ nei risultati di ricerca
    text = text.replace(/\$\$[\s\S]*?\$\$/g, ' … ');

    // (opzionale) Collassa anche le display equations in \[...\]
    text = text.replace(/\\\[[\s\S]*?\\\]/g, ' … ');

    // 2) Proteggi le porzioni LaTeX $...$ e $$...$$ con placeholder
    const latexPlaces = [];
    text = text.replace(/(\$\$?)([\s\S]*?)(\1)/g, function(_, open, body, close){
      const id = '<<LATEX' + latexPlaces.length + '>>';
      latexPlaces.push(open + body + close);
      return id;
    });

    // 3) Inserisci separatore tra pezzi incollati:
    //    a) fine frase/signo di interpunzione + parola con Maiuscola (es: ".Paradosso")
    text = text.replace(/([.!?])(\p{Lu})/gu, '$1 … $2');

    //    b) minuscola/numero + Maiuscola+minuscola (es: "rappresentaIl" -> "rappresenta … Il")
    //       nota: qui non tocchiamo sequenze di sole maiuscole (es. "MC")
    text = text.replace(/([\p{Ll}\p{N}])(\p{Lu})(?=\p{Ll})/gu, '$1 … $2');

    // 4) normalizza spazi e ritorna il contenuto ripristinando i latex placeholder
    text = text.replace(/\s+/g, ' ').trim();

    // ripristina i blocchi LaTeX nella posizione originale
    if (latexPlaces.length) {
      for (let i = 0; i < latexPlaces.length; i++) {
        const id = '<<LATEX' + i + '>>';
        text = text.replace(id, latexPlaces[i]);
      }
    }

    return text;
  }

  function escapeHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeHtmlEntities(s) {
    if (!s || typeof s !== 'string') return s || '';
    // Decodifica entità tipo &gt; &#39; &amp; ecc.
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  function renderLatexInHtml(plainText) {
    const katex = pickKatex();
    const decoded = decodeHtmlEntities(plainText);

    // Supporta anche \( ... \) e \[ ... \] convertendoli in delimitatori $...$ / $$...$$
    let decoded2 = decoded
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => `$${body}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, body) => `$$${body}$$`);

    // useremo una versione escaped SOLO per il testo non-LaTeX
    const sEsc = escapeHtml(decoded2);

    if (!katex || typeof katex.renderToString !== 'function') {
      return sEsc;
    }

    const parts = [];
    let i = 0;

    function pushText(t) {
      if (t) parts.push(t);
    }

    /*
      SOSTITUZIONE: ciclo robusto che determina se un '$' è APERTURA
      usando l'euristica: considerarlo opener se è all'inizio della stringa
      o se il carattere precedente è spazio/tab/newline o '('.
      Se il $ corrente non sembra un opener, si cerca il successivo $ che
      sembri opener plausibile (invece di interpretare male la sequenza).
      Gestisce anche $$ (display).
    */
    while (i < decoded2.length) {
      const next = decoded2.indexOf('$', i);
      if (next === -1) {
        // nessun altro dollaro -> testo normale fino alla fine
        pushText(escapeHtml(decoded2.slice(i)));
        break;
      }

      // aggiungi testo normale intermedio
      pushText(escapeHtml(decoded2.slice(i, next)));

      // se il $ trovato non sembra aprire una formula (secondo la regola nuova),
      // cerchiamo il prossimo $ che sia plausibile opener; se non lo troviamo,
      // trattiamo il resto come testo.
      function isLikelyOpeningAt(pos) {
        if (pos <= 0) return true;
        const prev = decoded2[pos - 1];
        // spazio, tab, newline o '(' considerati come indicatori di apertura
        if (/\s/.test(prev) || prev === '(') return true;
        return false;
      }

      if (!isLikelyOpeningAt(next)) {
        // cerca successivo $ che sembra apertura plausibile
        let foundOpen = -1;
        let probe = decoded2.indexOf('$', next + 1);
        while (probe !== -1) {
          if (isLikelyOpeningAt(probe)) { foundOpen = probe; break; }
          probe = decoded2.indexOf('$', probe + 1);
        }
        if (foundOpen === -1) {
          // nessuna apertura plausibile trovata -> trattiamo il resto come testo
          pushText(escapeHtml(decoded2.slice(next)));
          break;
        }
        // salta alla apertura plausibile trovata e ricomincia
        i = foundOpen;
        continue;
      }

      // il $ in 'next' è considerato apertura
      const isDisplay = decoded2.startsWith('$$', next);
      const delim = isDisplay ? '$$' : '$';
      const start = next + delim.length;

      // trova chiusura corrispondente
      const end = decoded2.indexOf(delim, start);
      if (end === -1) {
        // non troviamo la chiusura: trattiamo il segno come testo fino a fine
        pushText(escapeHtml(decoded2.slice(next)));
        break;
      }

      const latex = decoded2.slice(start, end).trim();
      if (!latex) {
        // formula vuota -> mostra i delimitatori come testo (escaped)
        pushText(escapeHtml(delim + delim));
        i = end + delim.length;
        continue;
      }

      try {
        const html = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: isDisplay,
          strict: 'ignore'
        });
        parts.push(html);
      } catch {
        pushText(escapeHtml(delim + latex + delim));
      }

      i = end + delim.length;
    }

    return parts.join('');
  }

  // --- helper: decide se un '$' in posizione pos è un "apri-formula"
  // pos: indice del '$' nella stringa `text`
  function isDollarOpener(text, pos) {
    if (!text || pos < 0 || pos >= text.length) return false;
    // se è il primo carattere -> probabilmente apertura
    if (pos === 0) return true;
    const prev = text[pos - 1];
    // considera opener se precedente è spazio, tab, newline oppure '('
    if (/\s|\(/.test(prev)) return true;
    return false;
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function stripBaseFromUrl(url) {
    const base = getBasePath();
    if (!url) return url;
    if (!base) return url;
    if (url === base) return '/';
    if (url.startsWith(base + '/')) return url.slice(base.length);
    return url;
  }

  // -------- DOM + logic --------

  const searchBtn = document.getElementById('content-search');
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const closeBtn = document.getElementById('search-close');

  if (!searchBtn || !overlay || !input || !results || !closeBtn) {
    return;
  }

  if (searchBtn.dataset.searchBound === '1') return;
  searchBtn.dataset.searchBound = '1';

  let indexData = null;
  let indexPromise = null;

  function setOverlayOpen(open) {
    overlay.style.display = open ? 'block' : 'none';
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      input.focus();
      input.select();
    }
  }

  function clearResults(messageHtml) {
    results.innerHTML = messageHtml ? `<div class="search-error">${messageHtml}</div>` : '';
  }

  function ensureIndexLoaded() {
    if (indexData) return Promise.resolve(indexData);
    if (indexPromise) return indexPromise;

    const url = getIndexUrl();
    indexPromise = fetch(url, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`Cannot load ${url} (${r.status})`);
        return r.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid search index (expected array)');
        indexData = data;
        return indexData;
      })
      .catch(err => {
        clearResults(escapeHtml(`Error: ${err.message}`));
        throw err;
      });

    return indexPromise;
  }

  function occCount(hay, needle) {
    if (!hay || !needle) return 0;
    let n = 0;
    let pos = 0;
    while (true) {
      const j = hay.indexOf(needle, pos);
      if (j === -1) return n;
      n++;
      pos = j + needle.length;
    }
  }

  function scoreMatchAND(haystack, haystackTight, tokens) {
    for (const t of tokens) {
      if (!t) continue;

      const okNormal = haystack.indexOf(t) !== -1;
      const okTight = (t.length >= 3) && (haystackTight.indexOf(t) !== -1);

      if (!okNormal && !okTight) return -1;
    }

    const idxs = [];
    for (const t of tokens) {
      if (!t) continue;

      const i1 = haystack.indexOf(t);
      if (i1 !== -1) idxs.push(i1);
      else if (t.length >= 3) {
        const i2 = haystackTight.indexOf(t);
        if (i2 !== -1) idxs.push(i2);
      }
    }

    const idx = idxs.length ? Math.min(...idxs) : -1;
    let score = 0;
    if (idx >= 0) score += Math.max(0, 5000 - idx);

    for (const t of tokens) {
      if (!t) continue;
      const c1 = occCount(haystack, t);
      const c2 = (c1 === 0 && t.length >= 3) ? occCount(haystackTight, t) : 0;
      score += (c1 + c2) * 20;
    }

    return score;
  }

  // -------------------- makeSnippet (heuristic-based pairing) --------------------
function makeSnippet(text, q, maxLen) {
  const t = stripLiquidAndNoise(text || '');
  const lower = t.toLowerCase();
  const qi = (q || '').toLowerCase();

  const foundAt = lower.indexOf(qi);

  // Final safety: never return a snippet with an unmatched inline LaTeX delimiter '$'
  function finalizeSnippet(sn) {
    if (!sn) return sn;
    const cnt = (sn.match(/\$/g) || []).length;
    if (cnt % 2 === 1) {
      const last = sn.lastIndexOf('$');
      if (last !== -1) {
        sn = sn.slice(0, last).trim();
      }
    }
    return sn;
  }

  if (foundAt === -1) {
    return finalizeSnippet(t.slice(0, maxLen));
  }

  const targetStart = Math.max(0, foundAt - Math.floor(maxLen / 3));
  let start = targetStart;
  let end = Math.min(t.length, start + maxLen);

  const backLimit = 600;
  const forwardLimit = 600;

  // helper: find all '$' positions within a slice [a,b)
  function dollarPositionsInSlice(a, b) {
    const pos = [];
    let p = t.indexOf('$', a);
    while (p !== -1 && p < b) {
      pos.push(p);
      p = t.indexOf('$', p + 1);
    }
    return pos;
  }

  // helper: decide if a $ at pos is likely an OPEN or CLOSE
  function likelyRoleAt(pos) {
    // consider OPEN if the char before is whitespace OR '('
    const before = (pos > 0) ? t.charAt(pos - 1) : ' ';
    if (/\s/.test(before) || before === '(') return 'OPEN';
    // otherwise likely CLOSE
    return 'CLOSE';
  }

  // build pairing inside current core; return {pairs: [[open,close],...], unpairedOpen}
  function pairDollars(coreStart, coreEnd) {
    const pos = dollarPositionsInSlice(coreStart, coreEnd);
    const roles = pos.map(p => ({ p, role: likelyRoleAt(p) }));
    const pairs = [];
    const stack = [];
    for (let i = 0; i < roles.length; i++) {
      const r = roles[i];
      if (r.role === 'OPEN') {
        stack.push(r.p);
      } else {
        if (stack.length > 0) {
          const o = stack.pop();
          pairs.push([o, r.p]);
        } else {
          // unmatched CLOSE -> record as pair with null open
          pairs.push([null, r.p]);
        }
      }
    }
    const unmatchedOpen = stack.slice();
    return { pairs, unmatchedOpen };
  }

  // attempt 1: pair inside current core
  let resultPairing = pairDollars(start, end);

  // If we have an unmatched CLOSE (null open), try to find an OPEN before 'start' within backLimit and include it.
  const hasOrphanClose = resultPairing.pairs.some(pair => pair[0] === null);
  if (hasOrphanClose) {
    const searchFrom = Math.max(0, start - backLimit);
    let foundOpen = -1;
    let p = t.indexOf('$', searchFrom);
    while (p !== -1 && p < start) {
      if (likelyRoleAt(p) === 'OPEN') foundOpen = p;
      p = t.indexOf('$', p + 1);
    }
    if (foundOpen !== -1) {
      start = foundOpen;
      resultPairing = pairDollars(start, end);
    }
  }

  // If we have unmatched OPEN at end, try to extend forward to include their close
  if (resultPairing.unmatchedOpen && resultPairing.unmatchedOpen.length) {
    const nextDollar = t.indexOf('$', end);
    if (nextDollar !== -1 && nextDollar - end <= forwardLimit) {
      end = nextDollar + 1;
      resultPairing = pairDollars(start, end);
    } else {
      end = Math.min(t.length, end + 40);
      resultPairing = pairDollars(start, end);
    }
  }

  // Safety: if odd number of $ inside core, try to remove leading partial formula or extend forward
  const core = t.slice(start, end);
  const dollarCount = (core.match(/\$/g) || []).length;
  if (dollarCount % 2 === 1) {
    const firstDollar = core.indexOf('$');
    const absFirstDollar = (firstDollar >= 0) ? start + firstDollar : -1;
    if (absFirstDollar > -1) {
      const tryStart = absFirstDollar + 1;
      if (tryStart - start <= backLimit) {
        start = tryStart;
      } else {
        const nextDollar = t.indexOf('$', end);
        if (nextDollar !== -1 && nextDollar - end <= forwardLimit) {
          end = nextDollar + 1;
        }
      }
    }
  }

  // build snippet with ellipses if trimmed
  let coreFinal = t.slice(start, end).trim();
  let snippet = coreFinal;
  if (start > 0) snippet = '…' + ' … ' + snippet;
  if (end < t.length) snippet = snippet + ' … ' + '…';

  return finalizeSnippet(snippet);
}


  // -------------------- end makeSnippet --------------------

  function renderResults(items, q) {
    if (!items.length) {
      clearResults('<div class="search-empty">Nessun risultato</div>');
      return;
    }

    results.innerHTML = '';

    items.forEach(item => {
      const a = document.createElement('a');
      a.href = toAbsoluteBookUrl(item.url);
      a.className = 'search-result';

      const titleEl = document.createElement('div');
      titleEl.className = 'search-title';

      const strong = document.createElement('strong');
      strong.textContent = (item.title && String(item.title).trim())
        ? String(item.title).trim()
        : stripBaseFromUrl(item.url);

      titleEl.appendChild(strong);

      const snippet = makeSnippet(item.content || '', q, 240);
      const snippetEl = document.createElement('div');
      snippetEl.className = 'search-snippet';
      snippetEl.dataset.rawSnippet = snippet;
      snippetEl.innerHTML = renderLatexInHtml(snippet);

      a.appendChild(titleEl);
      a.appendChild(snippetEl);

      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const targetUrl = toAbsoluteBookUrl(item.url);

        const frame = document.getElementById('toc-split-frame');
        if (frame) {
          frame.setAttribute('src', targetUrl);
          try {
            const u = new URL(window.location.href);
            u.searchParams.set('load', stripBaseFromUrl(item.url));
            window.history.pushState({}, '', u.toString());
          } catch {}
        } else {
          window.location.href = targetUrl;
        }

        setOverlayOpen(false);
      });

      results.appendChild(a);
    });

    ensureKatexLoaded().then((k) => {
      if (!k) return;
      document.querySelectorAll('#search-results .search-snippet').forEach((el) => {
        const raw = el.dataset.rawSnippet || el.textContent || '';
        el.innerHTML = renderLatexInHtml(raw);
      });
    }).catch(() => {});
  }

  function isBigTocResult(url) {
    const u = (stripBaseFromUrl(url || '') || '').replace(/\/{2,}/g, '/');
    return (
      /^\/(it|en)\/?$/.test(u) ||
      /^\/(it|en)\/index(?:\.html)?$/.test(u) ||
      /^\/(it|en)\/toc-big(?:\.html)?$/.test(u) ||
      /^\/(it|en)\/toc_big(?:\.html)?$/.test(u)
    );
  }

  function romanToInt(r) {
    const s = (r || "").toUpperCase();
    const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0, prev = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const v = map[s[i]] || 0;
      if (v < prev) total -= v;
      else { total += v; prev = v; }
    }
    return total || 0;
  }

  function bookOrderKey(url) {
    const u = (stripBaseFromUrl(url || "") || "").replace(/\/{2,}/g, "/");

    if (u === "/it/pr.html" || u === "/en/pr.html") return [0, 0, 0, 0];

    const m = u.match(/^\/(it|en)\/([^\/]+)\/(\d+)\/([^\/]+)$/);
    if (!m) return [999, 999, 999, 9];

    const partFolder = m[2];
    const chap = parseInt(m[3], 10) || 999;
    const last = m[4];

    const partIdx = romanToInt(partFolder);

    if (last === "index.html") {
      return [partIdx, chap, 0, 0];
    }

    const secMatch = last.match(/^(\d+)\.html$/);
    const sec = secMatch ? (parseInt(secMatch[1], 10) || 999) : 999;

    return [partIdx, chap, sec, 1];
  }

  function cmpKeys(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const da = a[i] ?? 0;
      const db = b[i] ?? 0;
      if (da !== db) return da - db;
    }
    return 0;
  }

  function doSearch(raw) {
    const qRaw = (raw || '').trim();
    if (!qRaw) {
      clearResults('');
      return;
    }

    // Query semantics:
    // - default (no quotes): AND across words
    // - quoted substrings: treated as phrases
    //   (and can be mixed with other words, e.g. market "adverse selection")
    function parseQuery(q) {
      const phrases = [];
      const re = /\"([^\"]+)\"/g;
      let m;
      while ((m = re.exec(q)) !== null) {
        const p = (m[1] || '').trim();
        if (p) phrases.push(p);
      }
      const withoutPhrases = q.replace(re, ' ');
      const tokens = normalize(withoutPhrases).split(' ').filter(Boolean);
      const phrasesNorm = phrases
        .map(p => normalize(p))
        .filter(Boolean);
      return { phrases, phrasesNorm, tokens };
    }

    function phraseScore(hay, hayTight, phraseNorm) {
      if (!phraseNorm) return { ok: false, score: -1, idx: -1 };
      const phraseTight = phraseNorm.replace(/\s+/g, '');

      let idx = hay.indexOf(phraseNorm);
      if (idx !== -1) {
        const sc = Math.max(0, 5000 - idx) + occCount(hay, phraseNorm) * 300;
        return { ok: true, score: sc, idx };
      }

      if (phraseTight.length >= 3) {
        idx = hayTight.indexOf(phraseTight);
        if (idx !== -1) {
          const sc = Math.max(0, 5000 - idx) + occCount(hayTight, phraseTight) * 300;
          return { ok: true, score: sc, idx };
        }
      }

      return { ok: false, score: -1, idx: -1 };
    }

    const { phrasesNorm, tokens } = parseQuery(qRaw);

    // For snippet positioning, prefer the first quoted phrase, otherwise the first token
    const snippetNeedle = (phrasesNorm && phrasesNorm.length)
      ? phrasesNorm[0]
      : ((tokens && tokens.length) ? tokens[0] : qRaw);

    ensureIndexLoaded().then(data => {
      const scored = [];

      for (const item of data) {
        if (isBigTocResult(item.url)) continue;
        const hay = normalize(stripLiquidAndNoise((item.content || '') + ' ' + (item.title || '')));
        const hayTight = hay.replace(/\s+/g, '');

        // 1) AND across all unquoted tokens
        let s = 0;
        if (tokens.length) {
          const ws = scoreMatchAND(hay, hayTight, tokens);
          if (ws < 0) continue;
          s += ws;
        }

        // 2) AND across all quoted phrases (as phrases)
        if (phrasesNorm.length) {
          for (const pNorm of phrasesNorm) {
            const ps = phraseScore(hay, hayTight, pNorm);
            if (!ps.ok) { s = -1; break; }
            s += ps.score;
          }
          if (s < 0) continue;
        }

        // If user typed only punctuation/spaces/quotes, ignore.
        if (!tokens.length && !phrasesNorm.length) continue;

        scored.push({ s, item });
      }

      scored.sort((a, b) => {
        const ka = bookOrderKey(a.item.url);
        const kb = bookOrderKey(b.item.url);

        const byKey = cmpKeys(ka, kb);
        if (byKey !== 0) return byKey;

        return b.s - a.s;
      });

      const MAX_TOTAL = 80;
      const MAX_PER_CHAPTER = 6;

      const picked = [];
      const perChapter = new Map();

      for (const entry of scored) {
        const k = bookOrderKey(entry.item.url);
        const chapterKey = `${k[0]}-${k[1]}`;

        const cur = perChapter.get(chapterKey) || 0;
        if (cur >= MAX_PER_CHAPTER) continue;

        perChapter.set(chapterKey, cur + 1);
        picked.push(entry.item);

        if (picked.length >= MAX_TOTAL) break;
      }

      renderResults(picked, snippetNeedle);
    }).catch(() => {});
  }

  // -------- events --------

  searchBtn.addEventListener('click', () => {
    setOverlayOpen(true);
    clearResults('');
    ensureIndexLoaded().catch(() => {});
    ensureKatexLoaded().catch(() => {});
  });

  closeBtn.addEventListener('click', () => setOverlayOpen(false));

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) setOverlayOpen(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && overlay.style.display !== 'none') {
      setOverlayOpen(false);
    }
  });

  let t = null;
  input.addEventListener('input', () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => doSearch(input.value), 80);
  });

})();
