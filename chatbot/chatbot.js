/* ============================================================
   Signal Chat — client-side Q&A over the site's markdown files.
   No server, no API key: loads context/*.md, chunks them, and
   retrieves the most relevant sections with BM25 ranking.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- configuration ---------- */

  var KNOWLEDGE_BASE = [
    { file: 'context/about.md',    source: 'about.md' },
    { file: 'context/journey.md',  source: 'journey.md' },
    { file: 'context/projects.md', source: 'projects.md' },
    { file: 'context/skills.md',   source: 'skills.md' },
    { file: 'context/contact.md',  source: 'contact.md' }
  ];

  var SUGGESTIONS = [
    'What has Kush built?',
    'Is Kush available for hire?',
    'What are his skills?',
    'Tell me about kvd',
    'How do I contact him?'
  ];

  var FALLBACK =
    "I couldn't find that in my notes about Kush. I'm grounded in this site's content — try asking about his **experience**, **projects**, **skills**, or **how to contact him**.";

  /* ---------- tokenizer & stopwords ---------- */

  // 'kush'/'pandya' are stopwords here: the whole site is about him,
  // so his name carries no discriminative weight in retrieval.
  var STOPWORDS = new Set((
    'a an the and or of to in is are was were be been being for on with at by from as it its ' +
    'his he him she her i you your me my we they them their this that what which who whom how ' +
    'when where why do does did can could should would will has have had about tell know there ' +
    'not no yes if but so than then too very just some any all kush pandya'
  ).split(' '));

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, ' ')
      .split(/[\s\-/]+/)
      .filter(function (t) { return t.length > 1 && !STOPWORDS.has(t); });
  }

  /* ---------- markdown chunking ---------- */

  // Split a markdown file into chunks at every heading. Each chunk
  // carries its heading trail so retrieval can match section titles.
  // A chunk whose heading equals the doc title is an "intro" chunk
  // (text before the first section) — handled specially at answer time.
  function chunkMarkdown(md, source) {
    var lines = md.split('\n');
    var chunks = [];
    var docTitle = '';
    var current = null;

    function flush() {
      if (current && current.body.trim()) chunks.push(current);
    }

    lines.forEach(function (line) {
      var m = /^(#{1,3})\s+(.*)$/.exec(line);
      if (m) {
        var title = m[2].replace(/[*_`]/g, '').trim();
        if (m[1] === '#') {
          docTitle = title;
          if (current && !current.body.trim()) current = null;
          return;
        }
        flush();
        current = { source: source, doc: docTitle, heading: title, body: '' };
      } else if (current) {
        current.body += line + '\n';
      } else if (line.trim()) {
        current = { source: source, doc: docTitle, heading: docTitle, body: line + '\n' };
      }
    });
    flush();
    return chunks;
  }

  /* ---------- BM25 index ---------- */

  var chunks = [];
  var avgLen = 0;
  var docFreq = {};   // term -> number of chunks containing it
  var ready = false;

  var K1 = 1.4, B = 0.75, MIN_LEN = 25;  // length floor: BM25 is unstable on tiny chunks

  function buildIndex(allChunks) {
    chunks = allChunks.map(function (c) {
      var isIntro = (c.heading === c.doc);
      // section headings are strong signals -> indexed twice.
      // intro chunks skip the doc title (it's identical to their heading).
      var text = c.heading + ' ' + c.heading + ' ' + c.body + (isIntro ? '' : ' ' + c.doc);
      var tokens = tokenize(text);
      var tf = {};
      tokens.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      return { data: c, tf: tf, len: tokens.length, intro: isIntro };
    });

    var total = 0;
    docFreq = {};
    chunks.forEach(function (c) {
      total += c.len;
      Object.keys(c.tf).forEach(function (t) { docFreq[t] = (docFreq[t] || 0) + 1; });
    });
    avgLen = total / Math.max(chunks.length, 1);
    ready = chunks.length > 0;
  }

  function idf(term) {
    var df = docFreq[term] || 0;
    var N = chunks.length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  function scoreChunk(c, terms) {
    var score = 0;
    var effLen = Math.max(c.len, MIN_LEN);
    terms.forEach(function (t) {
      var f = c.tf[t];
      if (!f) return;
      score += idf(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * effLen / avgLen));
    });
    return score;
  }

  function search(query) {
    var terms = tokenize(query);
    if (!terms.length) return [];
    return chunks
      .map(function (c) { return { chunk: c, score: scoreChunk(c, terms) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  /* ---------- tiny markdown renderer (safe) ---------- */

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(s) {
    s = escapeHtml(s);
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }

  function renderMarkdown(md) {
    var out = [];
    var inList = false;
    md.split('\n').forEach(function (raw) {
      var line = raw.trim();
      var li = /^[-*]\s+(.*)$/.exec(line);
      if (li) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + renderInline(li[1]) + '</li>');
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      if (!line) return;
      var h = /^#{1,4}\s+(.*)$/.exec(line);
      if (h) out.push('<span class="sc-md-h">' + renderInline(h[1]) + '</span>');
      else out.push('<p>' + renderInline(line) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  /* ---------- answer composition ---------- */

  // First substantive line of a chunk body (used for overview snippets)
  function firstSnippet(body, limit) {
    limit = limit || 150;
    var lines = body.split('\n');
    var pick = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s*[-*]\s+/, '').trim();
      var plain = line.replace(/[*_`#]/g, '').trim();
      if (!plain) continue;
      if (plain.length >= 40) { pick = line; break; }
      if (!pick) pick = line;   // remember first non-empty as fallback
    }
    if (!pick) return '';
    return pick.length > limit ? pick.slice(0, limit) + '…' : pick;
  }

  function trimBody(body, max) {
    body = body.trim();
    if (body.length <= max) return body;
    var cut = body.slice(0, max);
    var lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('.\n'), cut.lastIndexOf('. '));
    return lastBreak > 300 ? body.slice(0, lastBreak + 1) : cut + '…';
  }

  function sectionHtml(c) {
    var html = '';
    if (c.heading && c.heading !== c.doc) {
      html += '<span class="sc-md-h">' + renderInline(c.heading) + '</span>';
    }
    html += renderMarkdown(trimBody(c.body, 900));
    html += '<span class="sc-src">source: context/' + c.source + '</span>';
    return html;
  }

  // Overview answer: the doc's intro line + a snippet per section
  function overviewHtml(introChunk) {
    var html = '';
    var introBody = introChunk.body.trim();
    if (introBody) html += renderMarkdown(introBody);
    var secs = chunks.filter(function (c) {
      return !c.intro && c.data.source === introChunk.source;
    }).slice(0, 3);
    if (secs.length) {
      html += '<ul>';
      secs.forEach(function (c) {
        var d = c.data;
        html += '<li><strong>' + renderInline(d.heading) + '</strong> — ' +
                renderInline(firstSnippet(d.body)) + '</li>';
      });
      html += '</ul>';
    }
    html += '<span class="sc-src">source: context/' + introChunk.source + '</span>';
    return html;
  }

  function composeAnswer(query) {
    var results = search(query);

    if (!results.length || results[0].score < 1.0) {
      // name-only questions ("who is Kush?") have all tokens stopworded
      if (/\b(kush|pandya)\b/i.test(query)) {
        var about = chunks.filter(function (c) { return c.data.source === 'about.md'; })[0];
        if (about) return { html: sectionHtml(about.data) };
      }
      return { html: '<p>' + renderInline(FALLBACK) + '</p>' };
    }

    var top = results[0].chunk;
    if (top.intro) return { html: overviewHtml(top.data) };
    return { html: sectionHtml(top.data) };
  }

  /* ---------- intents ---------- */

  function intentReply(text) {
    var q = text.toLowerCase().trim();
    if (/^(hi+|hello|hey|yo|hiya|namaste|good (morning|afternoon|evening))\b/.test(q)) {
      return "Hey! I'm Kush's site assistant. I answer questions using the markdown notes behind this page — ask me about his **experience**, **projects** like kvd or AgentMesh NOC, **skills**, or **how to reach him**.";
    }
    if (/\b(thanks|thank you|thx|cheers)\b/.test(q)) {
      return 'Anytime. Anything else you want to know about Kush?';
    }
    if (/\b(bye|goodbye|see you|later)\b/.test(q)) {
      return 'See you around. If you need Kush, the contact section has his email and phone.';
    }
    if (/\b(who|what) are you\b/.test(q) || /\byou (a|an|the)? ?(bot|ai|assistant|robot)\b/.test(q)) {
      return "I'm a small retrieval bot built into this page. I read the site's markdown files (**context/*.md**) and pull the most relevant section for your question — no server, no external API, everything runs in your browser.";
    }
    return null;
  }

  /* ---------- UI ---------- */

  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  // onChip: callback for suggestion chips (passed from init, where
  // send() lives — the chips can't reach it from this scope)
  function buildWidget(onChip) {
    // launcher button
    var launcher = h('button', '', '');
    launcher.id = 'sc-launcher';
    launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML =
      '<span class="sc-pulse" aria-hidden="true"></span>' +
      '<svg class="sc-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
      '<svg class="sc-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    // panel
    var panel = h('div');
    panel.id = 'sc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat about Kush Pandya');

    var header = h('div', 'sc-header');
    header.innerHTML =
      '<div class="sc-avatar">KP</div>' +
      '<div><div class="sc-title">Ask about Kush</div>' +
      '<div class="sc-subtitle">grounded in context/*.md</div></div>';

    var messages = h('div');
    messages.id = 'sc-messages';
    messages.setAttribute('aria-live', 'polite');

    var chips = h('div');
    chips.id = 'sc-chips';
    SUGGESTIONS.forEach(function (s) {
      var chip = h('button', '', '');
      chip.type = 'button';
      chip.textContent = s;
      chip.addEventListener('click', function () { onChip(s); });
      chips.appendChild(chip);
    });

    var inputbar = h('div');
    inputbar.id = 'sc-inputbar';
    var input = h('input');
    input.id = 'sc-input';
    input.type = 'text';
    input.placeholder = 'Ask about experience, projects, skills…';
    input.setAttribute('aria-label', 'Message');
    input.autocomplete = 'off';
    var sendBtn = h('button');
    sendBtn.id = 'sc-send';
    sendBtn.type = 'button';
    sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
    inputbar.appendChild(input);
    inputbar.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(chips);
    panel.appendChild(inputbar);

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    return { launcher: launcher, panel: panel, messages: messages, input: input, sendBtn: sendBtn, chips: chips };
  }

  /* ---------- behaviour ---------- */

  function init() {
    var ui = buildWidget(function (text) { send(text); });
    var greeted = false;

    function toggle(open) {
      var willOpen = open !== undefined ? open : !ui.panel.classList.contains('open');
      ui.panel.classList.toggle('open', willOpen);
      ui.launcher.classList.toggle('open', willOpen);
      ui.launcher.setAttribute('aria-label', willOpen ? 'Close chat' : 'Open chat');
      if (willOpen) {
        if (!greeted) {
          greeted = true;
          botSay("Hi — I'm the assistant for this site. Ask me anything about **Kush's experience, projects, skills, or contact details**, and I'll pull the answer from his markdown notes.");
        }
        setTimeout(function () { ui.input.focus(); }, 350);
      }
    }

    function scrollDown() {
      ui.messages.scrollTop = ui.messages.scrollHeight;
    }

    function addMsg(cls, html) {
      var el = h('div', 'sc-msg ' + cls, html);
      ui.messages.appendChild(el);
      scrollDown();
      return el;
    }

    function botSay(text) {
      addMsg('bot', renderMarkdown(text));
    }

    var typing = null;
    function showTyping() {
      typing = h('div', 'sc-typing', '<span></span><span></span><span></span>');
      ui.messages.appendChild(typing);
      scrollDown();
    }
    function hideTyping() {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      typing = null;
    }

    function send(text) {
      var q = (text || ui.input.value).trim();
      if (!q) return;
      ui.input.value = '';
      addMsg('user', escapeHtml(q));
      showTyping();
      ui.sendBtn.disabled = true;

      // small delay so the typing indicator reads naturally
      setTimeout(function () {
        hideTyping();
        ui.sendBtn.disabled = false;
        var canned = intentReply(q);
        if (canned) { botSay(canned); return; }
        if (!ready) {
          botSay('My knowledge files failed to load — try the **contact section** at the bottom of the page instead.');
          return;
        }
        var answer = composeAnswer(q);
        addMsg('bot', answer.html);
        scrollDown();
      }, 420 + Math.random() * 380);
    }

    ui.launcher.addEventListener('click', function () { toggle(); });
    ui.sendBtn.addEventListener('click', function () { send(); });
    ui.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') send();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ui.panel.classList.contains('open')) toggle(false);
    });

    // nav hooks: any element with [data-open-chat] opens the widget
    document.querySelectorAll('[data-open-chat]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); toggle(true); });
    });

    /* ---------- load knowledge base ---------- */

    Promise.all(KNOWLEDGE_BASE.map(function (entry) {
      return fetch(entry.file)
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (md) { return chunkMarkdown(md, entry.source); })
        .catch(function () { return []; });
    })).then(function (results) {
      var all = [];
      results.forEach(function (r) { all = all.concat(r); });
      buildIndex(all);
      if (!ready) console.warn('[signal-chat] no knowledge chunks loaded');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
