/* AI Execution Vault — single-page app. No build step, no dependencies. */
(function () {
  'use strict';

  var CONFIG = {
    // Whop checkout link for the $24.99 plan. Replace with the real one from
    // Whop → Products → AI Execution Vault → Checkout link.
    checkoutUrl: 'https://whop.com/checkout/plan_REPLACE_ME/',
    price: 24.99
  };

  var V = window.VAULT;
  if (!V) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var catName = {};
  V.categories.forEach(function (c) { catName[c.id] = c.n; });

  /* ── Checkout (Whop) ─────────────────────────────────────────
   * Creator partners share links like ?a=theirhandle. Whop credits the
   * affiliate from the `a` param on the checkout URL, so carry it through —
   * and remember it, in case the visitor comes back later without it. */
  function checkoutHref() {
    var params = new URLSearchParams(window.location.search);
    var aff = params.get('a') || params.get('ref');
    if (aff && /^[\w.-]{1,64}$/.test(aff)) store.set('vault_aff', aff);
    else aff = store.get('vault_aff');
    var url;
    try { url = new URL(CONFIG.checkoutUrl); } catch (e) { return CONFIG.checkoutUrl; }
    if (aff) url.searchParams.set('a', aff);
    return url.toString();
  }
  var href = checkoutHref();
  $$('[data-checkout]').forEach(function (a) {
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
  });

  /* ── Toast ── */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1800);
  }

  /* ── Clipboard ── */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  /* ── Tabs (hash routing, no reload) ── */
  var TABS = ['vault', 'workflows', 'roi'];
  function showTab(name, scroll) {
    if (TABS.indexOf(name) === -1) name = 'vault';
    TABS.forEach(function (t) {
      var on = t === name;
      $('#panel-' + t).hidden = !on;
      var tab = $('#tab-' + t);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    if (scroll) {
      var panel = $('#panel-' + name);
      var top = panel.getBoundingClientRect().top + window.pageYOffset - 72;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }
  function go(name) {
    if (window.location.hash !== '#' + name) history.pushState(null, '', '#' + name);
    showTab(name, true);
  }
  $$('.tab').forEach(function (b, i, all) {
    b.addEventListener('click', function () { go(b.dataset.tab); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var next = all[(i + d + all.length) % all.length];
      next.focus();
      go(next.dataset.tab);
    });
  });
  $$('[data-tab-link]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); go(a.dataset.tabLink); });
  });
  $('.brand').addEventListener('click', function (e) {
    e.preventDefault();
    if (window.location.hash !== '#vault') history.pushState(null, '', '#vault');
    showTab('vault', false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('popstate', function () { showTab(window.location.hash.slice(1), false); });
  showTab(window.location.hash.slice(1), false);

  /* ── Stats ── */
  var nPrompts = V.items.filter(function (i) { return i.k === 'prompt'; }).length;
  $('#stat-total').textContent = V.items.length + V.workflows.length;
  $('#stat-prompts').textContent = nPrompts;
  $('#stat-workflows').textContent = V.workflows.length;
  $('#year').textContent = new Date().getFullYear();

  /* ── Vault: search + filters ── */
  var state = { q: '', cat: 'all', kind: 'all' };
  V.items.forEach(function (it, i) {
    it.id = i;
    it.hay = [it.n, it.d, it.tool, it.best, it.p, catName[it.c]].join(' ').toLowerCase();
  });

  var chipsEl = $('#chips');
  chipsEl.innerHTML = V.categories.map(function (c) {
    return '<button class="chip" data-cat="' + c.id + '" aria-pressed="' + (c.id === 'all') + '">' +
      esc(c.n) + '<span class="chip__n" data-n="' + c.id + '"></span></button>';
  }).join('');
  chipsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    state.cat = b.dataset.cat;
    $$('.chip', chipsEl).forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
    render();
  });

  $$('.seg__btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.kind = b.dataset.kind;
      $$('.seg__btn').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      render();
    });
  });

  var qEl = $('#q');
  qEl.addEventListener('input', function () { state.q = qEl.value; render(); });
  qEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { qEl.value = ''; state.q = ''; render(); qEl.blur(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
    if ($('#panel-vault').hidden) go('vault');
    qEl.focus();
  });
  $('#reset').addEventListener('click', function () {
    qEl.value = ''; state.q = ''; state.cat = 'all'; state.kind = 'all';
    $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c.dataset.cat === 'all' ? 'true' : 'false'); });
    $$('.seg__btn').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.kind === 'all' ? 'true' : 'false'); });
    render();
  });

  function matches(it, terms) {
    if (state.kind !== 'all' && it.k !== state.kind) return false;
    for (var i = 0; i < terms.length; i++) if (it.hay.indexOf(terms[i]) === -1) return false;
    return true;
  }

  function highlightPrompt(p) {
    return esc(p).replace(/(\[[^\]\n]{1,80}\]|\{\{[\w.]+\}\})/g, '<span class="ph">$1</span>');
  }

  var ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  var ICON_EXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

  function card(it, i) {
    var delay = ' style="animation-delay:' + Math.min(i, 12) * 18 + 'ms"';
    var top = '<div class="card__top"><span class="badge badge--' + it.k + '">' + (it.k === 'prompt' ? 'Prompt' : 'Tool') +
      '</span><span class="badge">' + esc(catName[it.c]) + '</span>' +
      (it.tool ? '<span class="card__tool" title="' + esc(it.tool) + '">' + esc(it.tool) + '</span>' : '') + '</div>';
    if (it.k === 'prompt') {
      return '<article class="card" data-id="' + it.id + '"' + delay + '>' + top +
        '<h3>' + esc(it.n) + '</h3><p class="card__d">' + esc(it.d) + '</p>' +
        '<pre class="prompt">' + highlightPrompt(it.p) + '</pre>' +
        '<div class="card__actions">' +
          '<button class="btn btn--ghost btn--sm expand" aria-expanded="false">Expand</button>' +
          '<button class="btn btn--ghost btn--sm copy" aria-label="Copy prompt: ' + esc(it.n) + '">' + ICON_COPY + '<span>Copy prompt</span></button>' +
        '</div></article>';
    }
    return '<article class="card" data-id="' + it.id + '"' + delay + '>' + top +
      '<h3>' + esc(it.n) + '</h3><p class="card__d">' + esc(it.d) + '</p>' +
      '<p class="card__best"><b>Best for:</b> ' + esc(it.best) + '</p>' +
      '<div class="card__actions"><a class="btn btn--ghost btn--sm ext" href="' + esc(it.u) + '" target="_blank" rel="noopener nofollow">' +
        ICON_EXT + '<span>Open ' + esc(it.n) + '</span></a></div></article>';
  }

  var gridEl = $('#grid'), countEl = $('#count'), emptyEl = $('#empty');
  function render() {
    var terms = state.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var counts = { all: 0 };
    var out = [];
    V.items.forEach(function (it) {
      if (!matches(it, terms)) return;
      counts.all++;
      counts[it.c] = (counts[it.c] || 0) + 1;
      if (state.cat === 'all' || it.c === state.cat) out.push(it);
    });
    $$('[data-n]', chipsEl).forEach(function (s) { s.textContent = counts[s.dataset.n] || 0; });
    gridEl.innerHTML = out.map(card).join('');
    var noun = state.kind === 'prompt' ? 'prompts' : state.kind === 'tool' ? 'tools' : 'resources';
    countEl.textContent = out.length + ' ' + (out.length === 1 ? noun.replace(/s$/, '') : noun) +
      (state.cat !== 'all' ? ' in ' + catName[state.cat] : '') + (terms.length ? ' matching “' + state.q.trim() + '”' : '');
    emptyEl.hidden = out.length > 0;
    $('#empty-q').textContent = state.q.trim() || catName[state.cat];
  }

  gridEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var cardEl = btn.closest('.card');
    var it = V.items[+cardEl.dataset.id];
    if (btn.classList.contains('expand')) {
      var open = cardEl.classList.toggle('is-open');
      btn.textContent = open ? 'Collapse' : 'Expand';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if (btn.classList.contains('copy')) {
      copyText(it.p).then(function () {
        btn.classList.add('is-done');
        btn.innerHTML = ICON_CHECK + '<span>Copied!</span>';
        toast('Prompt copied — paste it into ' + (it.tool || 'your AI tool'));
        clearTimeout(btn._t);
        btn._t = setTimeout(function () {
          btn.classList.remove('is-done');
          btn.innerHTML = ICON_COPY + '<span>Copy prompt</span>';
        }, 1600);
      }, function () { toast('Copy failed — select the text manually'); });
    }
  });

  render();

  /* ── Workflows ── */
  var wfList = $('#wf-list'), wfDetail = $('#wf-detail');
  var current = V.workflows[0].id;

  function doneSet(id) {
    var raw = store.get('vault_wf_' + id);
    try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }

  function renderWfList() {
    wfList.innerHTML = V.workflows.map(function (w, i) {
      return '<button class="wf__item" role="listitem" data-wf="' + w.id + '" aria-current="' + (w.id === current) + '">' +
        '<span class="wf__num">WORKFLOW 0' + (i + 1) + '</span>' +
        '<span class="wf__name">' + esc(w.n) + '</span>' +
        '<span class="wf__res">' + esc(w.result) + '</span></button>';
    }).join('');
  }

  function renderWf() {
    var w = V.workflows.filter(function (x) { return x.id === current; })[0];
    var done = doneSet(w.id);
    var pct = Math.round(done.length / w.steps.length * 100);
    wfDetail.innerHTML =
      '<h3>' + esc(w.n) + '</h3><p>' + esc(w.d) + '</p>' +
      '<div class="wf__kpis">' +
        '<div class="kpi"><span>Output</span><b>' + esc(w.result) + '</b></div>' +
        '<div class="kpi"><span>Your time</span><b>' + esc(w.time) + '</b></div>' +
        '<div class="kpi"><span>Impact</span><b>' + esc(w.saves) + '</b></div>' +
      '</div>' +
      '<div class="stack">' + w.stack.map(function (s) { return '<span class="badge">' + esc(s) + '</span>'; }).join('') + '</div>' +
      '<div class="progress"><div class="progress__track"><div class="progress__fill" style="width:' + pct + '%"></div></div><span>' +
        done.length + '/' + w.steps.length + ' done</span></div>' +
      '<ol class="steps">' + w.steps.map(function (s, i) {
        var d = done.indexOf(i) !== -1;
        return '<li class="step' + (d ? ' is-done' : '') + '" style="animation-delay:' + i * 40 + 'ms">' +
          '<span class="step__n">' + (d ? '✓' : i + 1) + '</span>' +
          '<div class="step__body"><div class="step__head"><h4>' + esc(s.t) + '</h4><span class="badge">' + esc(s.tool) + '</span>' +
          '<button class="step__check" data-step="' + i + '" aria-pressed="' + d + '">' + (d ? 'Done' : 'Mark done') + '</button></div>' +
          '<p>' + esc(s.d) + '</p></div></li>';
      }).join('') + '</ol>';
  }

  wfList.addEventListener('click', function (e) {
    var b = e.target.closest('.wf__item');
    if (!b) return;
    current = b.dataset.wf;
    $$('.wf__item', wfList).forEach(function (x) { x.setAttribute('aria-current', x === b ? 'true' : 'false'); });
    renderWf();
    if (window.innerWidth <= 960) {
      var top = wfDetail.getBoundingClientRect().top + window.pageYOffset - 76;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  });

  wfDetail.addEventListener('click', function (e) {
    var b = e.target.closest('.step__check');
    if (!b) return;
    var i = +b.dataset.step;
    var done = doneSet(current);
    var at = done.indexOf(i);
    if (at === -1) done.push(i); else done.splice(at, 1);
    store.set('vault_wf_' + current, JSON.stringify(done));
    // Update in place so the step list doesn't replay its entrance animation.
    var isDone = at === -1;
    var li = b.closest('.step');
    li.classList.toggle('is-done', isDone);
    $('.step__n', li).textContent = isDone ? '✓' : i + 1;
    b.textContent = isDone ? 'Done' : 'Mark done';
    b.setAttribute('aria-pressed', isDone ? 'true' : 'false');
    var total = $$('.step', wfDetail).length;
    $('.progress__fill', wfDetail).style.width = Math.round(done.length / total * 100) + '%';
    $('.progress > span', wfDetail).textContent = done.length + '/' + total + ' done';
    if (done.length === total && isDone) toast('Workflow complete 🎉');
  });

  renderWfList();
  renderWf();

  /* ── ROI calculator ── */
  // Share of time AI saves on each kind of work once the Vault's prompts and
  // workflows are in use. Deliberately conservative.
  var TASKS = [
    { id: 'write', n: 'Writing & copy', hint: 'posts, emails, scripts, captions', def: 6, save: 0.55 },
    { id: 'research', n: 'Research & planning', hint: 'ideas, competitors, strategy', def: 4, save: 0.5 },
    { id: 'media', n: 'Video & graphics', hint: 'editing, thumbnails, B-roll', def: 5, save: 0.4 },
    { id: 'admin', n: 'Inbox & admin', hint: 'email, follow-ups, reporting', def: 5, save: 0.5 },
    { id: 'code', n: 'Coding & building', hint: 'sites, tools, automations', def: 2, save: 0.35 }
  ];
  var WEEKS_PER_MONTH = 52 / 12;

  $('#roi-tasks').innerHTML = TASKS.map(function (t) {
    return '<div class="field"><div class="field__row"><label for="t-' + t.id + '">' + esc(t.n) +
      '<span class="field__hint">' + esc(t.hint) + ' · ~' + Math.round(t.save * 100) + '% faster</span></label>' +
      '<output id="t-' + t.id + '-out"></output></div>' +
      '<input type="range" id="t-' + t.id + '" min="0" max="30" step="1" value="' + t.def + '"></div>';
  }).join('');

  var money = function (n) {
    var s = Math.abs(Math.round(n)).toLocaleString('en-US');
    return (n < 0 ? '−$' : '$') + s;
  };

  function paint(input) {
    var p = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty('--p', p + '%');
  }

  var shown = 0, raf;
  function animateHours(to) {
    cancelAnimationFrame(raf);
    var from = shown, t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / 300);
      var e = 1 - Math.pow(1 - k, 3);
      shown = from + (to - from) * e;
      $('#roi-hours').innerHTML = Math.round(shown) + '<small>h</small>';
      if (k < 1) raf = requestAnimationFrame(step);
    })(t0);
  }

  function calc() {
    var rate = +$('#rate').value;
    var tools = +$('#tools').value;
    $('#rate-out').textContent = '$' + rate + '/h';
    $('#tools-out').textContent = '$' + tools;
    var totalHours = 0, saved = 0;
    TASKS.forEach(function (t) {
      var h = +$('#t-' + t.id).value;
      $('#t-' + t.id + '-out').textContent = h + ' h/wk';
      totalHours += h;
      saved += h * t.save;
    });
    var hoursMonth = saved * WEEKS_PER_MONTH;
    var value = hoursMonth * rate;
    var net = value - tools;
    animateHours(hoursMonth);
    $('#roi-bar').style.width = (totalHours ? Math.round(saved / totalHours * 100) : 0) + '%';
    $('#roi-value').textContent = money(value);
    $('#roi-cost').textContent = money(-tools);
    var netEl = $('#roi-net');
    netEl.textContent = money(net);
    netEl.classList.toggle('neg', net < 0);
    $('#roi-year').textContent = money(net * 12);
    var days = net > 0 ? CONFIG.price / (net / 30) : Infinity;
    $('#roi-payback').textContent = !isFinite(days) ? '—' : days < 1 ? 'under 1 day' : Math.ceil(days) + (Math.ceil(days) === 1 ? ' day' : ' days');
    $$('#roi-form input[type=range]').forEach(paint);
  }
  $('#roi-form').addEventListener('input', calc);
  calc();
})();
