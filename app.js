(() => {
  "use strict";
  const DATA = window.EXAM_CONTENT;
  const KEY = "zhixu-computer-v3-state";
  const main = document.querySelector("#main");
  const chapters = DATA?.chapters || [];
  const questions = chapters.flatMap(c => c.questions);
  const allQuestions = [...questions, ...chapters.flatMap(c => c.point_examples || [])];
  const qMap = new Map(allQuestions.map(q => [q.id, q]));
  const pointDrafts = new Map();
  const sections = chapters.flatMap(c => [
    ...c.foundation_sections.map(s => ({ ...s, chapter: c, type: "foundation" })),
    ...c.detailed_topics.map(s => ({ ...s, chapter: c, type: "topic" }))
  ]);
  const sMap = new Map(sections.map(s => [s.id, s]));
  const rMap = new Map((DATA?.references || []).map(r => [r.id, r]));
  const fresh = () => ({ version: 3, read: {}, answers: {}, saved: [], notes: {}, history: [], goal: 20, lastSection: null, session: null });
  const validSession = s => s && Array.isArray(s.ids) && s.ids.length > 0 && s.ids.length <= allQuestions.length && s.ids.every(id => qMap.has(id)) && ["practice", "mock"].includes(s.mode) && Number.isInteger(s.index) && s.index >= 0 && s.index < s.ids.length && s.responses && typeof s.responses === "object";
  function normalize(raw) {
    if (!raw || raw.version !== 3 || !raw.read || !raw.answers || !Array.isArray(raw.saved)) throw new Error("不是本工作台的学习记录");
    const next = fresh();
    for (const [id, value] of Object.entries(raw.read)) if (sMap.has(id) && value) next.read[id] = true;
    for (const [id, value] of Object.entries(raw.answers)) if (qMap.has(id) && value && /^[ABCD]$/.test(value.choice) && Number.isFinite(value.count) && Number.isFinite(value.at)) next.answers[id] = { choice: value.choice, correct: value.choice === qMap.get(id).answer, count: Math.max(1, value.count), at: value.at };
    next.saved = [...new Set(raw.saved.filter(id => qMap.has(id)))];
    for (const [id, note] of Object.entries(raw.notes || {})) if (qMap.has(id) && typeof note === "string") next.notes[id] = note.slice(0, 5000);
    next.history = (Array.isArray(raw.history) ? raw.history : []).filter(h => h && Number.isFinite(h.at) && Number.isFinite(h.correct) && Number.isFinite(h.total) && h.total > 0 && h.correct >= 0 && h.correct <= h.total && typeof h.label === "string").slice(-100);
    next.goal = [10, 20, 30, 50].includes(Number(raw.goal)) ? Number(raw.goal) : 20;
    next.lastSection = sMap.has(raw.lastSection) ? raw.lastSection : null;
    if (validSession(raw.session)) {
      next.session = { ...raw.session, responses: Object.fromEntries(Object.entries(raw.session.responses).filter(([id, v]) => raw.session.ids.includes(id) && v && /^[ABCD]$/.test(v.choice)).map(([id, v]) => [id, { choice: v.choice, committed: !!v.committed, at: Number(v.at) || Date.now() }])) };
    }
    return next;
  }
  let state = fresh();
  let storageAvailable = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = normalize(JSON.parse(raw)); } catch { storageAvailable = false; }
  let timer = null;
  let confirmCallback = null;
  let searchTimer = null;
  let listPage = 1;
  let activeChapter = "all";
  let previousPage = "";
  let view = null;
  const short = { A: "软硬件系统", B: "计算机网络", C: "信息安全", D: "云 · 数据 · AI · 物联网", E: "办公软件" };
  const escape = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const percent = (x, y) => y ? Math.round(x / y * 100) : 0;
  const wrongIds = () => Object.keys(state.answers).filter(id => !state.answers[id].correct);
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageAvailable = true; } catch { storageAvailable = false; toast("浏览器无法保存记录，请及时导出备份。"); }
    document.querySelector("#nav-wrong").textContent = wrongIds().length;
  }
  function toast(message) {
    const el = document.querySelector("#toast");
    el.textContent = message; el.classList.add("show");
    clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove("show"), 3000);
  }
  function ask(title, text, callback) {
    confirmCallback = callback;
    document.querySelector("#confirm-title").textContent = title;
    document.querySelector("#confirm-text").textContent = text;
    document.querySelector("#confirm-dialog").showModal();
  }
  const action = (name, label, cls = "button", attrs = "") => `<button type="button" class="${cls}" data-action="${name}" ${attrs}>${label}</button>`;
  const link = (url, label, cls = "button") => `<a class="${cls}" href="${escape(url)}">${label}</a>`;
  const progress = value => `<div class="progress-track"><span style="width:${Math.min(100, Math.max(0, value))}%"></span></div>`;
  function heading(eyebrow, title, subtitle, side = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${side}</div>`;
  }
  function tabs(selected, target) {
    return `<div class="filterbar" aria-label="选择板块">${link(`#${target}`, "全部板块", `filter ${selected === "all" ? "active" : ""}`)}${chapters.map(c => link(`#${target}/${c.id}`, escape(short[c.id]), `filter ${selected === c.id ? "active" : ""}`)).join("")}</div>`;
  }
  function stats(c) {
    const ids = c ? c.questions.map(q => q.id) : allQuestions.map(q => q.id);
    const answered = ids.filter(id => state.answers[id]);
    const right = answered.filter(id => state.answers[id].correct);
    return { total: ids.length, done: answered.length, right: right.length, wrong: answered.length - right.length, rate: percent(right.length, answered.length) };
  }
  function inline(raw) {
    let s = escape(raw);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\[(S\d+)\]/g, (_, id) => `<a href="#sources/${id}">${id}</a>`);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return s;
  }
  function markdown(raw) {
    const lines = String(raw || "").split("\n"), result = [];
    let buffer = [], list = false, code = false, table = [];
    function flush() { if (buffer.length) { result.push(`<p>${inline(buffer.join(" "))}</p>`); buffer = []; } if (list) { result.push("</ul>"); list = false; } }
    function flushTable() {
      if (!table.length) return;
      const rows = table.filter(l => !/^\|[\s:|-]+\|$/.test(l));
      result.push("<table>");
      rows.forEach((l, i) => result.push(`<tr>${l.split("|").slice(1,-1).map(v => `<${i === 0 ? "th" : "td"}>${inline(v.trim())}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`));
      result.push("</table>"); table = [];
    }
    for (const line of lines) {
      if (line.startsWith("```")) { flush(); flushTable(); result.push(code ? "</code></pre>" : "<pre><code>"); code = !code; continue; }
      if (code) { result.push(escape(line) + "\n"); continue; }
      if (line.startsWith("|")) { flush(); table.push(line); continue; }
      flushTable();
      if (!line.trim()) { flush(); continue; }
      const h = line.match(/^(#{1,6}) (.*)/);
      if (h) { flush(); result.push(`<h3>${inline(h[2])}</h3>`); continue; }
      if (/^[-*] /.test(line)) { if (buffer.length) { result.push(`<p>${inline(buffer.join(" "))}</p>`); buffer = []; } if (!list) { result.push("<ul>"); list = true; } result.push(`<li>${inline(line.slice(2))}</li>`); continue; }
      if (list) { result.push("</ul>"); list = false; }
      buffer.push(line);
    }
    flush(); flushTable(); if (code) result.push("</code></pre>"); return result.join("");
  }
  function showHome() {
    const total = stats(), read = Object.keys(state.read).length;
    const today = Object.values(state.answers).filter(a => new Date(a.at).toDateString() === new Date().toDateString()).length;
    const next = sMap.get(state.lastSection) || sections.find(s => !state.read[s.id]) || sections[0];
    const history = state.history.slice(-3).reverse();
    main.innerHTML = heading("YOUR LEARNING SPACE", "把知识学清楚，把每题做明白。", "五个板块，一套完整的计算机专业知识复习路径。", `<span class="pill">1000 道选择题已就绪</span>`) +
      `<section class="hero"><div class="hero-copy"><div class="hero-overline">TODAY'S FOCUS / 今日复习</div><h2>${state.lastSection ? "接着上次，继续积累。" : "从计算机基础，开始第一步。"}</h2><p>${escape(next.chapter.title)} · ${escape(next.title)}<br>先理解概念，再通过对应例题检查掌握情况。</p><div class="buttons">${link(`#learn/${next.chapter.id}/${next.id}`, state.lastSection ? "继续学习 →" : "开始学习 →")}${link("#mock", "来一次随机自测", "button secondary")}</div></div><div class="hero-graphic" aria-label="五个板块，共1000道题"><div class="orbit"><div class="orbit-center"><strong>1000</strong><small>题 · 循序掌握</small></div><span class="orbit-tag t1"><span>▤</span>知识学习</span><span class="orbit-tag t2"><span>▧</span>章节练习</span><span class="orbit-tag t3"><span>↺</span>错题复习</span></div></div></section>` +
      `<div class="content-update"><strong>逐知识点学习已更新</strong><span>${DATA.stats.explanation_entries_total} 条教学说明，每条都有例题 · 新增100条机制、场景与易混详解 · 主题库1000题，补充例题331题</span></div><section class="stats" aria-label="学习进度">${stat("已读知识专题", read, `/ ${sections.length}`, "已读仅代表完成阅读", "▤")}${stat("已练习题目", total.done, `/ ${allQuestions.length}`, "含知识点补充例题", "▧")}${stat("当前正确率", total.rate, "%", total.done ? `当前答对 ${total.right} 题` : "完成第一题后开始统计", "✓")}${stat("待复习错题", total.wrong, "题", "重做正确后自动移出", "↺")}</section>` +
      `<div class="home-lower"><div><div class="section-head"><h2>五大知识板块</h2>${link("#learn", "查看知识图谱 ↗", "text-button")}</div><div class="chapters-list">${chapters.map(c => {
        const cs = stats(c), ss = sections.filter(s => s.chapter.id === c.id), cr = ss.filter(s => state.read[s.id]).length;
        return `<article class="panel chapter-row"><div class="chapter-number">${c.id}</div><div class="chapter-info"><h3>${escape(c.title)}</h3><p>${ss.length} 个学习专题 · 200 道题 · 已读 ${cr} 个</p></div><div class="chapter-progress">练习 ${cs.done}/200${progress(percent(cs.done, 200))}</div>${link(`#learn/${c.id}`, "进入学习 →", "button secondary small")}</article>`;
      }).join("")}</div></div><aside><div class="section-head"><h2>今日小目标</h2><span class="pill green">积少成多</span></div><div class="panel plan"><h3>每天，给知识一点时间。</h3><div class="goal-count">${today}<small> / ${state.goal} 题</small></div>${progress(percent(today, state.goal))}<p>${today >= state.goal ? "今天的练习目标已完成，回看错题巩固一下。" : `还差 ${Math.max(0, state.goal - today)} 题完成今天的目标。`}</p>${link("#practice", "开始章节练习 →")}<ul class="timeline">${history.length ? history.map(h => `<li><b>${escape(h.label)}</b>${h.correct}/${h.total} 题正确 · ${new Date(h.at).toLocaleDateString("zh-CN")}</li>`).join("") : `<li><b>先读一个专题</b>理解术语、功能和易混点。</li><li><b>再做对应例题</b>解释另外三个选项为什么不合适。</li><li><b>最后回看错题</b>让薄弱的知识变得清晰。</li>`}</ul></div><div class="tip">本套内容对应截图中的专业知识部分（70%）。相关拓展已标记，例题为原创练习。</div></aside></div>`;
  }
  function stat(label, value, unit, foot, symbol) { return `<div class="panel stat"><span class="stat-icon">${symbol}</span><div class="stat-label">${label}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`; }
  function pointExample(item) {
    const q = qMap.get(item.example_question_id);
    if (!q) return "";
    const draft = pointDrafts.get(q.id);
    const result = draft?.committed ? { choice:draft.choice } : !draft && state.answers[q.id] ? state.answers[q.id] : null;
    const selected = draft?.choice || result?.choice;
    return `<div class="point-example" data-example="${escape(q.id)}"><div class="example-heading"><span class="pill">配套例题 · 四选一</span>${action("save-point",state.saved.includes(q.id) ? "★ 已收藏" : "☆ 收藏","text-button",`data-id="${escape(q.id)}" aria-pressed="${state.saved.includes(q.id)}"`)}</div><h4>${escape(q.stem)}</h4><div class="options">${q.options.map(o=>`<button type="button" class="option ${o.id===selected?"selected":""} ${result&&o.id===q.answer?"correct":""} ${result&&o.id===selected&&o.id!==q.answer?"wrong":""}" data-action="point-option" data-id="${escape(q.id)}" data-choice="${o.id}" aria-pressed="${o.id===selected}" ${result?"disabled":""}><span class="option-letter">${o.id}</span><span>${escape(o.text)}</span>${result&&o.id===q.answer?'<span class="result-symbol">✓ 正确</span>':result&&o.id===selected&&o.id!==q.answer?'<span class="result-symbol">× 所选</span>':""}</button>`).join("")}</div>${result?`<div class="point-feedback" role="status"><strong>${result.choice===q.answer?"✓ 回答正确":"× 回答错误"} · 正确答案 ${q.answer}</strong><p>${inline(q.explanation)}</p>${q.distractor_notes?.length?`<details><summary>查看其他选项的含义</summary><ul>${q.distractor_notes.map(n=>`<li><strong>${escape(n.option_text)}：</strong>${inline(n.explanation)}</li>`).join("")}</ul></details>`:""}</div>${action("point-retry","再做一次","button secondary small",`data-id="${escape(q.id)}"`)}`:action("point-submit","提交答案并看解析","button small",`data-id="${escape(q.id)}" ${selected?"":"disabled"}`)}<details class="point-notes"><summary>写下这个知识点的笔记</summary><label class="sr-only" for="note-${escape(q.id)}">例题笔记</label><textarea id="note-${escape(q.id)}" class="note" data-point-note="${escape(q.id)}" maxlength="5000" rows="3" placeholder="易混点、理解或记忆方法…">${escape(state.notes[q.id]||"")}</textarea></details></div>`;
  }
  function pointCard(item, i) {
    return `<section class="knowledge-item" id="point-${escape(item.id)}"><span class="term-num">${String(i+1).padStart(2,"0")} / ${escape(item.id)}</span><h3>${escape(item.term)}</h3><div class="point-detail"><p>${inline(item.explanation)}</p>${[["mechanism","组成或机制"],["worked_example","具体场景"],["confusion","易混区别"]].map(([field,label])=>item[field]?`<p><strong>${label}：</strong>${inline(item[field])}</p>`:"").join("")}</div>${pointExample(item)}</section>`;
  }
  function refreshExample(id) {
    const item = sections.flatMap(s=>s.knowledge_items||s.items||[]).find(p=>p.example_question_id===id);
    const el = Array.from(document.querySelectorAll("[data-example]")).find(e=>e.dataset.example===id);
    if (el && item) el.outerHTML=pointExample(item);
  }
  function showLearn(parts) {
    const c = chapters.find(c => c.id === parts[1]) || chapters[0];
    const chapterSections = sections.filter(s => s.chapter.id === c.id);
    const selected = chapterSections.find(s => s.id === parts[2]) || chapterSections[0];
    view = { page: "learn", section: selected };
    state.lastSection = selected.id; persist();
    const index = chapterSections.findIndex(s => s.id === selected.id);
    main.innerHTML = heading("KNOWLEDGE MAP", "知识图谱", "按专题学习定义、功能与易混点，再做对应的选择题。") + tabs(c.id, "learn") +
      `<div class="learn-layout"><aside class="panel topic-list" aria-label="专题目录">${["foundation", "topic"].map(type => `<h3>${type === "foundation" ? "基础讲义 · 逐点配题" : "细分与详细补充"}</h3>${chapterSections.filter(s => s.type === type).map(s => `<a class="topic-item ${s.id === selected.id ? "active" : ""}" href="#learn/${c.id}/${s.id}" ${s.id === selected.id ? 'aria-current="page"' : ""}>${state.read[s.id] ? '<span class="read-dot" aria-label="已读">✓</span>' : ""}${escape(s.title)}<small>${s.id} · ${s.scope === "基础拓展" ? "相关拓展" : s.scope==="详细补充"?"详细补充":"基础知识"}</small></a>`).join("")}`).join("")}</aside><article class="panel reading"><div class="reading-head"><span class="pill ${selected.scope === "基础拓展" ? "gold" : ""}">${selected.scope === "基础拓展" ? "相关拓展" : selected.scope==="详细补充"?"详细补充 · 机制与场景":"基础知识"}</span><h2>${escape(selected.title)}</h2><div class="muted">${selected.id} · ${escape(c.title)} · 每条知识均有例题</div><div class="buttons">${action("read", state.read[selected.id] ? "✓ 已读 · 点击取消" : "标记为已读", state.read[selected.id] ? "button secondary small" : "button small", `data-id="${selected.id}"`)}${action("section-practice", "练习本专题 →", "button secondary small", `data-id="${selected.id}"`)}</div></div><div class="prose">${selected.guide?`<p>${escape(selected.guide)}</p>`:""}${(selected.knowledge_items||selected.items||[]).map(pointCard).join("")}${selected.type==="foundation"&&selected.content_markdown.includes("|")?`<details><summary>查看原讲义与速查表</summary>${markdown(selected.content_markdown)}</details>`:""}</div><div class="reading-bottom">${index ? link(`#learn/${c.id}/${chapterSections[index-1].id}`, "← 上一个专题", "button secondary small") : "<span></span>"}${index < chapterSections.length - 1 ? link(`#learn/${c.id}/${chapterSections[index+1].id}`, "下一个专题 →", "button secondary small") : link(`#practice/${c.id}`, "进入章节练习 →", "button small")}</div><div class="source-links">${(selected.source_ids || []).map(id => link(`#sources/${id}`, `${id} · ${escape(rMap.get(id)?.title || "资料")}`, "")).join("")}</div></article></div>`;
  }
  function showPractice(parts) {
    const selected = chapters.some(c => c.id === parts[1]) ? parts[1] : "all";
    view = { page: "practice" };
    main.innerHTML = heading("CHAPTER PRACTICE", "章节练习", "即时反馈与逐题解析。选择一章，或只练未做题与对应专题。") + (state.session && !state.session.finished ? `<div class="tip buttons">还有一组未完成的${state.session.mode === "mock" ? "自测" : "练习"}。${link("#quiz", "继续上次 →", "text-button")}</div><br>` : "") + tabs(selected, "practice") +
      `<div class="practice-grid">${chapters.filter(c => selected === "all" || c.id === selected).map(c => {
        const cs = stats(c); return `<article class="panel practice-card"><span class="pill">板块 ${c.id} / 200 题</span><h2>${escape(c.title)}</h2><p>已练 ${cs.done} 题 · 当前答对 ${cs.right} 题 · 待复习 ${cs.wrong} 题</p>${progress(percent(cs.done, 200))}<div class="practice-controls"><label class="sr-only" for="practice-mode-${c.id}">题目范围</label><select id="practice-mode-${c.id}"><option value="all">全部题目 · 按章节顺序</option><option value="unseen">只练未做题</option><option value="random">随机抽取</option><option value="wrong">本章错题</option></select><label class="sr-only" for="practice-count-${c.id}">题量</label><select id="practice-count-${c.id}"><option value="20">20 题</option><option value="50">50 题</option><option value="200">整章 200 题</option></select></div><div class="buttons">${action("chapter-practice", "开始练习 →", "button", `data-id="${c.id}"`)}${link(`#learn/${c.id}`, "先看知识", "text-button")}</div></article>`;
      }).join("")}</div>`;
  }
  function shuffled(array) { const a = array.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function start(ids, mode, label, minutes = 0) {
    if (!ids.length) { toast("这个范围暂时没有可练习的题目。"); return; }
    const create = () => { state.session = { ids, mode, label, index: 0, responses: {}, started: Date.now(), deadline: minutes ? Date.now() + minutes * 60000 : null, finished: false }; persist(); if (location.hash === "#quiz") render(); else location.hash = "#quiz"; };
    if (state.session && !state.session.finished && Object.keys(state.session.responses).length) ask("开始新的练习？", "上次已提交的答题记录会保留，未提交的自测作答将被替换。", create); else create();
  }
  function showMock() {
    view = { page: "mock" };
    main.innerHTML = heading("SELF ASSESSMENT", "随机自测", "答题时隐藏答案，交卷后统一评分、显示解析，并收集错题。") +
      `<div class="setup-grid"><form id="mock-form" class="panel panel-pad"><h2>设置这次自测</h2><div class="form-field"><label for="mock-chapter">复习范围</label><select id="mock-chapter"><option value="all">五个板块 · 均衡抽题</option>${chapters.map(c => `<option value="${c.id}">${escape(c.title)}</option>`).join("")}</select></div><div class="form-field"><label for="mock-count">题目数量</label><select id="mock-count"><option value="20">20 题 · 快速检查</option><option value="50" selected>50 题 · 综合自测</option><option value="100">100 题 · 集中训练</option></select></div><div class="form-field"><label for="mock-minutes">计时方式</label><select id="mock-minutes"><option value="0">不限时</option><option value="20">20 分钟</option><option value="40">40 分钟</option><option value="60">60 分钟</option></select></div><button class="button" type="submit">开始自测 →</button></form><aside class="panel panel-pad"><span class="pill">先独立作答，再看解析</span><h2 style="margin-top:20px">用一次自测，发现薄弱处。</h2><p class="muted">每题 1 分，不倒扣。未答题按未作答统计，交卷后可逐题查看答案。</p><ul class="timeline"><li><b>全范围均衡抽取</b>五个板块平均分配，题目不重复。</li><li><b>题号导航随时跳转</b>已选答案会自动保存到这次自测。</li><li><b>限时结束自动交卷</b>返回页面时也会检查是否到时。</li></ul><div class="tip">这里是复习自测，抽题比例和计分不代表官方试卷规则。</div>${state.session && !state.session.finished ? `<br>${link("#quiz", "继续上次未完成的练习 →", "text-button")}` : ""}</aside></div>`;
  }
  function record(q, choice, at = Date.now()) {
    const oldAnswer = state.answers[q.id];
    state.answers[q.id] = { choice, correct: choice === q.answer, count: (oldAnswer?.count || 0) + 1, at };
  }
  function finish() {
    const s = state.session; if (!s || s.finished) return;
    for (const id of s.ids) {
      const r = s.responses[id];
      if (s.mode === "mock" && r) { record(qMap.get(id), r.choice); r.committed = true; }
    }
    s.finished = true; s.finishedAt = Date.now();
    const correct = s.ids.filter(id => s.responses[id]?.committed && s.responses[id].choice === qMap.get(id).answer).length;
    state.history.push({ label: s.label, at: Date.now(), total: s.ids.length, correct });
    state.history = state.history.slice(-100); persist(); render();
  }
  function elapsed(s) { return Math.max(0, Math.floor(((s.finishedAt || Date.now()) - s.started) / 1000)); }
  function clock(seconds) { return `${String(Math.floor(seconds/60)).padStart(2, "0")}:${String(seconds%60).padStart(2,"0")}`; }
  function renderQuiz(review = false) {
    const s = state.session;
    if (!s) { main.innerHTML = heading("PRACTICE", "还没有开始练习", "选择一个板块，开始你的第一组题。") + link("#practice", "选择练习"); return; }
    if (!s.finished && s.deadline && Date.now() >= s.deadline) { finish(); toast("自测时间已到，已自动交卷。"); return; }
    if (s.finished && !review) { showResult(); return; }
    const q = qMap.get(s.ids[s.index]), response = s.responses[q.id];
    const revealed = s.finished || (s.mode === "practice" && response?.committed);
    const answered = Object.keys(s.responses).length;
    view = { page: "quiz", review };
    main.innerHTML = heading(s.mode === "mock" ? "SELF ASSESSMENT" : "FOCUSED PRACTICE", escape(s.label), s.finished ? "已交卷 · 逐题回看" : s.mode === "mock" ? "独立作答，交卷后查看评分和解析。" : "选出答案，提交后查看解析。", `<span class="pill">${s.index+1} / ${s.ids.length}</span>`) +
      `<div class="question-layout"><article class="panel question-card"><div class="question-meta"><span>${q.id} · ${escape(short[q.chapter_id])} · ${escape(q.category)}</span>${action("save", state.saved.includes(q.id) ? "★ 已收藏" : "☆ 收藏", "text-button", `data-id="${q.id}" aria-pressed="${state.saved.includes(q.id)}"`)}</div><h2 class="question-stem">${escape(q.stem)}</h2><div class="options" role="group" aria-label="答案选项">${q.options.map(o => {
        const isCorrect = revealed && o.id === q.answer, isWrong = revealed && o.id === response?.choice && o.id !== q.answer;
        return `<button class="option ${response?.choice === o.id ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}" data-action="option" data-choice="${o.id}" aria-pressed="${response?.choice === o.id}" ${revealed ? "disabled" : ""}><span class="option-letter">${o.id}</span><span>${escape(o.text)}</span>${isCorrect ? '<span class="result-symbol">✓ 正确答案</span>' : isWrong ? '<span class="result-symbol">× 你的选择</span>' : ""}</button>`;
      }).join("")}</div><div class="question-actions"><div class="buttons">${action("previous", "← 上一题", "button secondary", s.index === 0 ? "disabled" : "")}${action("next", "下一题 →", "button secondary", s.index === s.ids.length-1 ? "disabled" : "")}</div>${s.mode === "practice" && !revealed ? action("submit-answer", "提交答案", "button", response ? "" : "disabled") : s.finished ? action("results", "回到结果", "button") : action("finish", s.mode === "mock" ? "交卷并评分" : "结束练习", "button")}</div>${revealed ? explanation(q, response) : ""}</article><aside class="panel question-map"><h3>答题卡</h3><p class="muted" style="font-size:12px;margin-bottom:0">已选 ${answered} / ${s.ids.length} 题</p><div class="map-time" id="quiz-time">${s.deadline && !s.finished ? clock(Math.max(0,Math.ceil((s.deadline-Date.now())/1000))) : clock(elapsed(s))}</div><div class="map-grid">${s.ids.map((id,i) => {
        const r = s.responses[id], known = s.finished || (s.mode === "practice" && r?.committed);
        return action("jump", i+1, `map-cell ${i === s.index ? "current" : ""} ${r ? "answered" : ""} ${known && r ? r.choice === qMap.get(id).answer ? "correct" : "wrong" : ""}`, `data-index="${i}" aria-label="第${i+1}题${r ? "，已选" : "，未选"}"`);
      }).join("")}</div><div class="map-legend">${s.mode === "mock" && !s.finished ? "浅蓝：已选答案 · 蓝框：当前题<br>交卷后再显示对错。" : "浅绿：答对 · 浅红：答错<br>蓝框：当前题 · 灰色：未作答"}</div><br>${s.finished ? action("results", "查看本次结果", "button secondary small") : action("finish", s.mode === "mock" ? "交卷并评分" : "结束本组练习", "button secondary small")}</aside></div>`;
    if (!s.finished) timer = setInterval(() => {
      if (s.deadline && Date.now() >= s.deadline) { finish(); toast("时间已到，已自动交卷。"); return; }
      const el = document.querySelector("#quiz-time"); if (el) el.textContent = s.deadline ? clock(Math.max(0, Math.ceil((s.deadline-Date.now())/1000))) : clock(elapsed(s));
    }, 1000);
  }
  function explanation(q, response) {
    return `<section class="explanation" aria-live="polite"><h3 class="${response?.choice === q.answer ? "good" : "bad"}">${!response ? "未作答" : response.choice === q.answer ? "✓ 回答正确" : "× 回答错误"} · 正确答案 ${q.answer}</h3><p>${inline(q.explanation)}</p>${q.distractor_notes?.length ? `<details><summary>另外三个选项为什么不合适？</summary><ul>${q.distractor_notes.map(n => `<li><strong>${escape(n.option_text)}：</strong>${inline(n.explanation)}</li>`).join("")}</ul></details>` : ""}<div class="buttons" style="margin-top:15px">${link(`#learn/${q.chapter_id}/${q.section_id}`, "回看对应知识 →", "text-button")}</div><label for="question-note">我的笔记</label><textarea class="note" id="question-note" data-id="${q.id}" rows="3" maxlength="5000" placeholder="写下容易混淆的地方，自动保存…">${escape(state.notes[q.id] || "")}</textarea></section>`;
  }
  function showResult() {
    const s = state.session;
    const answered = s.ids.filter(id => s.responses[id]?.committed).length;
    const right = s.ids.filter(id => s.responses[id]?.committed && s.responses[id].choice === qMap.get(id).answer).length;
    const wrong = answered - right, missing = s.ids.length - answered;
    view = { page: "result" };
    const misses = s.ids.filter(id => !s.responses[id]?.committed || s.responses[id].choice !== qMap.get(id).answer);
    main.innerHTML = heading("SESSION RESULT", "这次练习，积累了什么？", escape(s.label)) +
      `<div class="panel result-summary"><span class="pill green">练习已结束</span><div class="result-score">${right}<small> / ${s.ids.length}</small></div><p>答对 ${right} 题 · 答错 ${wrong} 题 · 未提交 ${missing} 题 · 用时 ${clock(elapsed(s))}</p><p>${right === s.ids.length ? "这一组全部答对，换一个板块继续验证。" : "把还不清楚的概念重新读一遍，再做一次更有把握。"}</p><div class="buttons">${action("review", "逐题查看解析 →", "button")}${misses.length ? action("retry-misses", "重做错题与未答题", "button secondary") : ""}${link("#practice", "选择下一组", "button secondary")}</div></div><div class="section-head"><h2>各板块表现</h2><p>未作答不计入错题本</p></div><div class="panel">${chapters.filter(c => s.ids.some(id => qMap.get(id).chapter_id === c.id)).map(c => {
        const ids = s.ids.filter(id => qMap.get(id).chapter_id === c.id), cr = ids.filter(id => s.responses[id]?.committed && s.responses[id].choice === qMap.get(id).answer).length;
        return `<div class="list-row"><span class="chapter-number">${c.id}</span><div class="list-body"><h3>${escape(c.title)}</h3><small>${cr} / ${ids.length} 题正确</small></div>${link(`#learn/${c.id}`, "回看知识 →", "text-button")}</div>`;
      }).join("")}</div>`;
  }
  function showCollection(kind, parts) {
    activeChapter = chapters.some(c => c.id === parts[1]) ? parts[1] : "all";
    if (previousPage !== `${kind}/${activeChapter}`) listPage = 1;
    previousPage = `${kind}/${activeChapter}`;
    const source = kind === "wrong" ? wrongIds() : state.saved;
    const ids = source.filter(id => activeChapter === "all" || qMap.get(id).chapter_id === activeChapter).sort((a,b) => (state.answers[b]?.at || 0) - (state.answers[a]?.at || 0));
    const pages = Math.max(1, Math.ceil(ids.length/20)); listPage = Math.min(listPage, pages);
    view = { page: kind, ids, pages };
    main.innerHTML = heading(kind === "wrong" ? "REVISIT & UNDERSTAND" : "YOUR BOOKMARKS", kind === "wrong" ? "我的错题" : "我的收藏", kind === "wrong" ? "保留每道题最近一次已提交的错误；重做答对后自动移出。" : "收藏难点与重点，随时再练一次。", ids.length ? action("collection-practice", "练习当前列表 →", "button small") : "") + tabs(activeChapter, kind) +
      (ids.length ? `<div class="panel">${ids.slice((listPage-1)*20,listPage*20).map(id => {
        const q = qMap.get(id), a = state.answers[id];
        return `<article class="list-row"><span class="row-id">${id}</span><div class="list-body"><h3>${escape(q.stem)}</h3><small>${escape(short[q.chapter_id])} · ${a ? `已提交 ${a.count} 次` : "尚未作答"}${state.notes[id] ? " · 有笔记" : ""}</small></div><div class="buttons">${action("one-question", "重新练习", "button secondary small", `data-id="${id}"`)}${link(`#learn/${q.chapter_id}/${q.section_id}`, "知识 ↗", "text-button")}${kind === "saved" ? action("save", "取消收藏", "text-button", `data-id="${id}"`) : ""}</div></article>`;
      }).join("")}</div><div class="pagination">${action("page-prev", "← 上一页", "button secondary small", listPage === 1 ? "disabled" : "")}<span>${listPage} / ${pages} 页 · ${ids.length} 题</span>${action("page-next", "下一页 →", "button secondary small", listPage === pages ? "disabled" : "")}</div>` :
        `<div class="panel empty"><div class="empty-icon">${kind === "wrong" ? "✓" : "☆"}</div><h2>${kind === "wrong" ? "这里暂时没有错题。" : "还没有收藏题目。"}</h2><p>${kind === "wrong" ? "开始练习，错题会自动整理到这里。" : "在练习中点击题目右上角的收藏，留住值得回看的题。"}</p>${link("#practice", "开始章节练习 →")}</div>`);
  }
  function showSettings(parts) {
    view = { page: "settings" };
    const chosenRef = parts[0] === "sources" ? parts[1] : null;
    main.innerHTML = heading("YOUR DATA & REFERENCES", "记录管理与资料", "保存你的学习积累，查看讲义对应的参考资料。") +
      `<div class="settings-grid"><section class="panel panel-pad"><h2>学习记录备份</h2><p class="muted">已读专题、答题记录、收藏和笔记保存在当前浏览器。导出文件可以备份或转到另一台设备，导入时会替换当前记录。</p><div class="buttons">${action("export", "导出学习记录", "button")}${action("import", "导入记录", "button secondary")}</div><p class="muted" style="font-size:11px;margin:16px 0 0">${storageAvailable ? "当前可保存本地记录。" : "当前浏览器无法持久保存，请导出备份。"}不同浏览器或网址的记录分别保存。</p></section><section class="panel panel-pad"><h2>每日目标</h2><div class="form-field"><label for="daily-goal">每日练习题量（按不同题目统计）</label><select id="daily-goal">${[10,20,30,50].map(n => `<option value="${n}" ${n === state.goal ? "selected" : ""}>${n} 题 / 天</option>`).join("")}</select></div><div class="buttons">${action("reset", "清空学习记录", "button secondary small")}</div></section></div><div class="tip">内容共 5 个板块、1000 题，基础与细分专题共 ${sections.length} 个。相关资料不代表原机构出题，教学展开不能保证覆盖所有可能命题。截图之外的 30% 尚未纳入。</div><div class="section-head"><h2>参考资料索引</h2><p>${DATA.references.length} 项资料 · 按主题核对</p></div><div class="panel source-list">${DATA.references.map(r => `<details id="ref-${r.id}" ${r.id === chosenRef ? "open" : ""}><summary>${r.id} · ${escape(r.title)}</summary><p>${escape(r.supports)}<br>阅读状态：${escape(r.retrieval_status)}</p><a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">打开原始资料 ↗</a></details>`).join("")}</div>`;
    if (chosenRef) requestAnimationFrame(() => document.getElementById(`ref-${chosenRef}`)?.scrollIntoView({ block: "center" }));
  }
  function render() {
    clearInterval(timer); timer = null;
    const parts = location.hash.slice(1).split("/"), page = parts[0] || "home";
    const label = { home:"学习总览", learn:"知识图谱", practice:"章节练习", mock:"随机自测", quiz:"答题练习", review:"答案解析", wrong:"我的错题", saved:"我的收藏", settings:"记录管理", sources:"资料索引" }[page] || "学习总览";
    document.querySelector("#page-label").textContent = label;
    document.title = `${label} · 知序复习工作台`;
    document.querySelectorAll("[data-page]").forEach(a => { const active = a.dataset.page === page || a.dataset.page === "practice" && ["quiz","review"].includes(page); a.classList.toggle("active", active); if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.querySelector("#sidebar").classList.remove("open");
    document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
    try {
      if (page === "learn") showLearn(parts);
      else if (page === "practice") showPractice(parts);
      else if (page === "mock") showMock();
      else if (page === "quiz" || page === "review") renderQuiz(page === "review");
      else if (page === "wrong" || page === "saved") showCollection(page, parts);
      else if (page === "settings" || page === "sources") showSettings(parts);
      else showHome();
    } catch (error) { main.innerHTML = `<div class="panel empty"><h1>页面暂时无法显示</h1><p>请返回总览重试。已有学习记录仍会保留。</p>${link("#home","返回总览")}</div>`; console.error(error); }
  }
  function search() {
    const term = document.querySelector("#search-input").value.trim().toLowerCase();
    const el = document.querySelector("#search-results");
    if (!term) { el.innerHTML = '<p class="muted">可以搜索讲义全文、术语、题干或题号。</p>'; return; }
    const foundSections = sections.filter(s => [s.id,s.title,s.content_markdown,s.guide,...(s.knowledge_items || s.items || []).map(i => `${i.term} ${i.explanation} ${i.mechanism||""} ${i.worked_example||""} ${i.confusion||""}`)].join(" ").toLowerCase().includes(term));
    const foundQ = allQuestions.filter(q => `${q.id} ${q.stem}`.toLowerCase().includes(term));
    const results = [...foundSections.map(s => ({ url:`#learn/${s.chapter.id}/${s.id}`, caption:`知识 · ${short[s.chapter.id]} · ${s.id}`, title:s.title })), ...foundQ.map(q => ({ id:q.id, caption:`题目 · ${short[q.chapter_id]} · ${q.id}`, title:q.stem }))];
    el.innerHTML = `<p class="muted" style="font-size:12px">找到 ${results.length} 项${results.length>50 ? "，先显示前 50 项" : ""}</p>${results.slice(0,50).map(r => r.url ? `<a class="search-result" href="${r.url}" data-search-link><small>${escape(r.caption)}</small>${escape(r.title)}</a>` : `<button class="search-result" style="text-align:left;width:100%;border:0;background:white" data-action="search-question" data-id="${r.id}"><small>${escape(r.caption)}</small>${escape(r.title)}</button>`).join("")}${results.length ? "" : '<p class="muted">试试更短的关键词，例如“缓存”“TCP”。</p>'}`;
  }
  document.addEventListener("click", event => {
    if (event.target.closest("#sidebar a")) {
      document.querySelector("#sidebar").classList.remove("open");
      document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
    }
    const searchLink = event.target.closest("[data-search-link]");
    if (searchLink) document.querySelector("#search-dialog").close();
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const a = button.dataset.action, id = button.dataset.id, s = state.session;
    if (a === "menu") { const open = document.querySelector("#sidebar").classList.toggle("open"); button.setAttribute("aria-expanded", String(open)); }
    else if (a === "search") { document.querySelector("#search-dialog").showModal(); search(); document.querySelector("#search-input").focus(); }
    else if (a === "close-search") document.querySelector("#search-dialog").close();
    else if (a === "cancel-confirm") { document.querySelector("#confirm-dialog").close(); confirmCallback = null; }
    else if (a === "confirm") { document.querySelector("#confirm-dialog").close(); const callback = confirmCallback; confirmCallback = null; callback?.(); }
    else if (a === "read") { if (state.read[id]) delete state.read[id]; else state.read[id] = true; persist(); render(); toast(state.read[id] ? "专题已标记为已读。" : "已取消已读标记。"); }
    else if (a === "section-practice") { const section = sMap.get(id); start(allQuestions.filter(q => q.section_id === id).map(q => q.id), "practice", section.title); }
    else if (a === "point-option") { pointDrafts.set(id,{choice:button.dataset.choice,committed:false}); refreshExample(id); }
    else if (a === "point-submit") { const draft=pointDrafts.get(id); if (!draft?.choice||draft.committed) return; draft.committed=true; record(qMap.get(id),draft.choice); persist(); refreshExample(id); }
    else if (a === "point-retry") { pointDrafts.set(id,{choice:null,committed:false}); refreshExample(id); }
    else if (a === "save-point") { const index=state.saved.indexOf(id); if(index>=0)state.saved.splice(index,1);else state.saved.push(id);persist();refreshExample(id); }
    else if (a === "chapter-practice") {
      const c = chapters.find(c => c.id === id), mode = document.getElementById(`practice-mode-${id}`).value, count = Number(document.getElementById(`practice-count-${id}`).value);
      let qs = c.questions; if (mode === "unseen") qs = qs.filter(q => !state.answers[q.id]); if (mode === "wrong") qs = qs.filter(q => state.answers[q.id] && !state.answers[q.id].correct);
      start((mode === "random" ? shuffled(qs) : qs).slice(0,count).map(q => q.id), "practice", `${c.title} · ${mode === "wrong" ? "错题" : mode === "unseen" ? "未做题" : "章节练习"}`);
    }
    else if (a === "save") { const i = state.saved.indexOf(id); if (i >= 0) state.saved.splice(i,1); else state.saved.push(id); persist(); render(); toast(i >= 0 ? "已取消收藏。" : "已加入收藏。"); }
    else if (a === "option" && s && !s.finished) { const qid = s.ids[s.index]; if (s.mode === "practice" && s.responses[qid]?.committed) return; s.responses[qid] = { choice:button.dataset.choice, committed:false, at:Date.now() }; persist(); render(); }
    else if (a === "submit-answer" && s && !s.finished) { const q = qMap.get(s.ids[s.index]), r = s.responses[q.id]; if (!r || r.committed) return; r.committed = true; record(q,r.choice); persist(); render(); }
    else if (a === "previous" || a === "next" || a === "jump") { if (!s) return; s.index = a === "jump" ? Number(button.dataset.index) : Math.max(0,Math.min(s.ids.length-1,s.index+(a === "next" ? 1 : -1))); persist(); render(); }
    else if (a === "finish" && s) { const unanswered = s.ids.filter(id => !s.responses[id] || s.mode === "practice" && !s.responses[id].committed).length; ask(s.mode === "mock" ? "确认交卷？" : "结束这组练习？", unanswered ? `还有 ${unanswered} 题${s.mode === "mock" ? "未作答，交卷后按0分统计。" : "未提交，结束后可从结果页重做。"}` : "本次结果会加入学习记录。", finish); }
    else if (a === "review" && s) { s.index = 0; persist(); location.hash = "#review"; }
    else if (a === "results") { location.hash = "#quiz"; }
    else if (a === "retry-misses" && s) { start(s.ids.filter(id => !s.responses[id]?.committed || s.responses[id].choice !== qMap.get(id).answer), "practice", "错题与未答题再练"); }
    else if (a === "one-question" || a === "search-question") { document.querySelector("#search-dialog").close(); start([id], "practice", `单题练习 · ${id}`); }
    else if (a === "collection-practice") start(shuffled(view.ids), "practice", view.page === "wrong" ? "错题回练" : "收藏练习");
    else if (a === "page-prev" || a === "page-next") { listPage += a === "page-next" ? 1 : -1; render(); }
    else if (a === "export") {
      const blob = new Blob([JSON.stringify({ ...state, exportedAt:new Date().toISOString() },null,2)],{type:"application/json"}), url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `知序-学习记录-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast("学习记录已导出。");
    }
    else if (a === "import") document.querySelector("#import-file").click();
    else if (a === "reset") ask("清空全部学习记录？", "已读、答题、错题、收藏和笔记都会清空。建议先导出备份，知识与题库不会被删除。", () => { state = fresh(); pointDrafts.clear(); persist(); render(); toast("已清空个人学习记录。"); });
  });
  document.addEventListener("submit", event => {
    if (event.target.id !== "mock-form") return;
    event.preventDefault();
    const selected = document.querySelector("#mock-chapter").value, count = Number(document.querySelector("#mock-count").value), minutes = Number(document.querySelector("#mock-minutes").value);
    let ids;
    if (selected === "all") ids = shuffled(chapters.flatMap(c => shuffled(c.questions).slice(0,count/5).map(q => q.id)));
    else ids = shuffled(chapters.find(c => c.id === selected).questions).slice(0,count).map(q => q.id);
    start(ids,"mock",`${selected === "all" ? "五个板块综合" : short[selected]} · ${count} 题自测`,minutes);
  });
  document.addEventListener("input", event => {
    if (event.target.dataset.pointNote) { state.notes[event.target.dataset.pointNote] = event.target.value; persist(); }
    if (event.target.id === "search-input") { clearTimeout(searchTimer); searchTimer = setTimeout(search,140); }
    if (event.target.id === "question-note") { state.notes[event.target.dataset.id] = event.target.value; persist(); }
  });
  document.addEventListener("change", async event => {
    if (event.target.id === "daily-goal") { state.goal = Number(event.target.value); persist(); toast("每日目标已更新。"); }
    if (event.target.id !== "import-file") return;
    const file = event.target.files[0]; event.target.value = ""; if (!file) return;
    if (file.size > 5000000) { toast("记录文件过大，请选择本工作台导出的JSON。"); return; }
    try { const incoming = normalize(JSON.parse(await file.text())); ask("导入并替换学习记录？", `导入 ${Object.keys(incoming.answers).length} 道题记录、${Object.keys(incoming.read).length} 个已读专题。当前记录会被替换。`, () => { state = incoming; pointDrafts.clear(); persist(); render(); toast("学习记录导入完成。"); }); } catch { toast("无法读取这份记录，请使用本工作台导出的JSON文件。"); }
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector("#search-dialog").showModal(); search(); document.querySelector("#search-input").focus(); }
    if (event.key === "Escape") { document.querySelector("#sidebar").classList.remove("open"); document.querySelector(".menu-toggle").setAttribute("aria-expanded","false"); }
  });
  window.addEventListener("hashchange", () => { window.scrollTo(0,0); render(); });
  window.addEventListener("storage", event => { if (event.key === KEY && event.newValue) { try { state = normalize(JSON.parse(event.newValue)); render(); } catch {} } });
  document.querySelector("#chapter-nav").innerHTML = chapters.map(c => `<a class="chapter-nav-link" href="#learn/${c.id}"><span>${c.id}</span>${escape(short[c.id])}</a>`).join("");
  if (chapters.length !== 5 || questions.length !== 1000) { main.innerHTML = '<div class="panel empty"><h1>学习内容未完整载入</h1><p>请保留content.js与页面在同一文件夹，再重新打开。</p></div>'; return; }
  document.querySelector("#nav-wrong").textContent = wrongIds().length;
  render();
})();
