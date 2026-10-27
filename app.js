(() => {
  "use strict";
  const D = window.HD_CONTENT;
  const main = document.querySelector("#main"), KEY = "zhixu-huadian-2026-v5";
  if (!D || D.lessons.length !== 48 || D.bank.length !== 563) {
    main.innerHTML = '<div class="panel empty"><h1>学习内容未完整载入</h1><p>请确认 content.js 已下载到页面同一目录，再重新打开。</p></div>'; return;
  }
  const qs = [...D.bank, ...D.examples], qm = new Map(qs.map(q => [q.id, q]));
  const lm = new Map(D.lessons.map(l => [l.id,l])), gm = new Map(D.groups.map(g => [g.id,g]));
  const typeName = { single:"单选", multiple:"多选", judge:"判断" };
  const e = x => String(x ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const percent = (x,y) => y ? Math.round(x/y*100) : 0;
  const btn = (a,label,cls="button",attrs="") => `<button type="button" class="${cls}" data-action="${a}" ${attrs}>${label}</button>`;
  const link = (url,text,cls="button") => `<a class="${cls}" href="${e(url)}">${text}</a>`;
  const heading = (tag,title,sub,side="") => `<div class="page-heading"><div><div class="eyebrow">${tag}</div><h1>${title}</h1><p>${sub}</p></div>${side}</div>`;
  const progress = (x,y) => `<div class="progress-track"><span style="width:${percent(x,y)}%"></span></div>`;
  const fresh = () => ({version:5,read:{},memorized:{},answers:{},saved:[],notes:{},history:[],lastLesson:"L01",session:null});
  const choiceOK = (q,c) => typeof c==="string" && c.length>0 && [...new Set(c)].sort().join("")===c && [...c].every(v => q.options.some(o => o.id===v)) && (q.type==="multiple" || c.length===1);
  function normalize(raw) {
    if (!raw || raw.version!==5 || !raw.answers || !raw.read || !Array.isArray(raw.saved)) throw Error("记录版本不匹配");
    const s=fresh();
    for (const [id,v] of Object.entries(raw.read)) if (lm.has(id)&&v) s.read[id]=true;
    for (const [id,v] of Object.entries(raw.memorized||{})) if (qm.has(id)&&v) s.memorized[id]=true;
    for (const [id,v] of Object.entries(raw.answers)) if(qm.has(id)&&v&&choiceOK(qm.get(id),v.choice)&&Number.isFinite(v.at)) s.answers[id]={choice:v.choice,correct:v.choice===qm.get(id).answer,at:v.at};
    s.saved=[...new Set(raw.saved.filter(id=>qm.has(id)))];
    for(const [id,v] of Object.entries(raw.notes||{})) if(qm.has(id)&&typeof v==="string")s.notes[id]=v.slice(0,5000);
    s.history=(Array.isArray(raw.history)?raw.history:[]).filter(h=>h&&typeof h.label==="string"&&Number.isFinite(h.at)&&Number.isInteger(h.total)&&Number.isInteger(h.right)&&h.total>0&&h.right>=0&&h.right<=h.total).slice(-50);
    if(lm.has(raw.lastLesson))s.lastLesson=raw.lastLesson;
    const r=raw.session;
    if(r&&["memorize","practice","exam"].includes(r.mode)&&Array.isArray(r.ids)&&r.ids.length>0&&r.ids.length<=qs.length&&new Set(r.ids).size===r.ids.length&&r.ids.every(id=>qm.has(id))&&Number.isInteger(r.index)&&r.index>=0&&r.index<r.ids.length) {
      s.session={ids:r.ids,index:r.index,mode:r.mode,label:typeof r.label==="string"?r.label:"恢复练习",responses:{},finished:!!r.finished,hidden:!!r.hidden};
      for(const [id,v] of Object.entries(r.responses||{})) if(r.ids.includes(id)&&v&&choiceOK(qm.get(id),v.choice))s.session.responses[id]={choice:v.choice,committed:!!v.committed};
    }
    return s;
  }
  let state=fresh(), storage=true, callback=null, listPage=1, collectionKind="", searchTimer;
  const drafts=new Map();
  try { const r=localStorage.getItem(KEY); if(r)state=normalize(JSON.parse(r)); } catch { storage=false; }
  const wrong = () => Object.keys(state.answers).filter(id=>!state.answers[id].correct);
  function persist() {
    try {localStorage.setItem(KEY,JSON.stringify(state));storage=true;} catch {storage=false;toast("当前浏览器无法保存，请到记录管理导出备份。");}
    document.querySelector("#nav-wrong").textContent=wrong().length;
  }
  function toast(text) {const el=document.querySelector("#toast");el.textContent=text;el.classList.add("show");clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove("show"),2800);}
  function ask(title,text,fn) {callback=fn;document.querySelector("#confirm-title").textContent=title;document.querySelector("#confirm-text").textContent=text;document.querySelector("#confirm-dialog").showModal();}
  function shuffle(a) {a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function record(q,c) {state.answers[q.id]={choice:c,correct:c===q.answer,at:Date.now()};}
  function start(ids,mode,label) {
    if(!ids.length){toast("这个范围暂时没有题目，请调整筛选条件。");return;}
    const run=()=>{state.session={ids,mode,label,index:0,responses:{},finished:false,hidden:false};persist();if(location.hash==="#session")render();else location.hash="#session";};
    const s=state.session;
    if(s&&!s.finished&&s.mode!=="memorize"&&Object.keys(s.responses).length)ask("开始新的一组？","当前已提交记录保留；这组尚未交卷的选择将被替换。",run);else run();
  }
  function stat(label,n,unit,foot,symbol) {return `<div class="panel stat"><span class="stat-icon">${symbol}</span><div class="stat-label">${label}</div><div class="stat-value">${n}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`;}
  function home() {
    const prior=D.bank.slice(0,500), mem=prior.filter(q=>state.memorized[q.id]).length, done=prior.filter(q=>state.answers[q.id]).length, right=prior.filter(q=>state.answers[q.id]?.correct).length;
    const l=lm.get(state.lastLesson)||D.lessons[0], s=state.session;
    main.innerHTML=heading("A CLEARER PATH / 按新大纲重建","这次，按正确的大纲复习。","计算机类专业版 · 专业知识70%，通用类知识30%。")+
      `<section class="hero"><div class="hero-copy"><div class="hero-overline">先学专业，再把固定分数抓牢</div><h2>48节知识详解<br>500道固定题，先背再做。</h2><p>数据结构、数据库、网络、操作系统等10个方向。<br>原题答案完整保留，多选与判断也能独立练习。</p><div class="buttons">${link(`#learn/${l.id}`,"继续知识学习 →")}${link("#bank","开始背固定题","button secondary")}</div></div><div class="hero-graphic" aria-label="48节新大纲"><div class="orbit"><div class="orbit-center"><strong>48</strong><small>节 · 全部对应</small></div><span class="orbit-tag t1">▤ 知识详解</span><span class="orbit-tag t2">▧ 固定原题</span><span class="orbit-tag t3">↺ 先背再做</span></div></div></section>`+
      `<div class="content-update"><strong>新大纲已替换旧范围</strong><span>48节 · ${D.stats.points}个教学知识点与配套例题；PDF固定题共563道，前500道为默认范围，额外63道可选。</span></div>`+
      (s?`<div class="tip buttons">上次${s.mode==="memorize"?"背诵":s.mode==="exam"?"自测":"练习"}：${e(s.label)} · 第${s.index+1}/${s.ids.length}题 ${link("#session",s.finished?"查看上次结果 →":"继续上次 →","text-button")}</div><br>`:"")+
      `<section class="stats">${stat("已读大纲章节",Object.keys(state.read).length,"/48","按真实阅读标记","▤")}${stat("前500题 · 已背",mem,"/500","背过不等于已经掌握","☆")}${stat("前500题 · 已做",done,"/500",`最近一次答对${right}题`,"▧")}${stat("待复习错题",wrong().length,"题","固定题与专业例题均计入","↺")}</section>`+
      `<div class="home-lower"><section><div class="section-head"><h2>10个专业方向</h2>${link("#learn","查看48节目录 ↗","text-button")}</div><div class="chapters-list">${D.groups.map(g=>{const ls=D.lessons.filter(l=>l.group===g.id),r=ls.filter(l=>state.read[l.id]).length;return `<article class="panel chapter-row"><span class="chapter-number">${g.id}</span><div class="chapter-info"><h3>${e(g.title)}</h3><p>大纲第${ls[0].number}—${ls.at(-1).number}条 · 已读${r}/${ls.length}节</p></div>${link(`#learn/${ls[0].id}`,"进入学习 →","button secondary small")}</article>`;}).join("")}</div></section><aside><div class="section-head"><h2>固定题学习路径</h2></div><div class="panel plan"><h3>先记正确内容，再检验记忆。</h3><ul class="timeline"><li><b>背诵</b>显示原答案和正确选项内容，逐题标记已背。</li><li><b>独立自测</b>不显示答案，完成后交卷统一评分。</li><li><b>错题回练</b>可即时看解析，也可再次隐藏答案自测。</li></ul>${link("#bank","选择背练范围 →")}<p class="muted" style="margin-top:18px">前500题包含245单选、181多选、74判断。</p></div><div class="tip">“固定题必考占5分”按你的复习说明安排；PDF未找到该分值条款。其他通用能力题仍需另行复习。</div></aside></div>`;
  }
  function note(q) {return `<details class="point-notes"><summary>我的记忆笔记</summary><label class="sr-only" for="note-${q.id}">本题笔记</label><textarea class="note" id="note-${q.id}" data-note="${q.id}" maxlength="5000" rows="3" placeholder="记住答案内容、易混词或改错理由…">${e(state.notes[q.id]||"")}</textarea></details>`;}
  function source(q) {return q.origin?`原创配套例题 · 大纲PDF第${q.source_page}页`:`原题第${q.number}题 · ${typeName[q.type]} · ${e(q.category)} · PDF第${q.source_page}页（印刷页${q.source_page-1}）`;}
  function optionHTML(q,selected,reveal,actionName,locked=false) {
    return `<div class="options" role="group" aria-label="${q.type==="multiple"?"多选答案，可选择多项":"答案选项"}">${q.options.map(o=>`<button type="button" class="option ${selected?.includes(o.id)?"selected":""} ${reveal&&q.answer.includes(o.id)?"correct":""} ${reveal&&selected?.includes(o.id)&&!q.answer.includes(o.id)?"wrong":""}" data-action="${actionName}" data-id="${q.id}" data-choice="${o.id}" aria-pressed="${selected?.includes(o.id)?"true":"false"}" ${locked?"disabled":""}><span class="option-letter">${o.id}</span><span>${e(o.text)}</span>${reveal&&q.answer.includes(o.id)?'<span class="result-symbol">✓ 答案</span>':""}</button>`).join("")}</div>`;
  }
  function answerHTML(q,response) {
    const correct=response?.choice===q.answer;
    return `<section class="explanation" aria-live="polite">${response?`<h3 class="${correct?"good":"bad"}">${correct?"✓ 回答正确":"× 回答错误"} · 你的答案 ${e(response.choice)}</h3>`:""}<h3>标准答案 ${q.answer} · ${e(q.answer_text)}</h3><p>${e(q.explanation|| (q.type==="judge"&&q.answer==="B"?"原题判定：本题说法错误。请记住“不成立”，不要把错误题干作为正确知识背诵。":"背诵重点："+q.answer_text))}</p>${q.origin?link(`#learn/${q.lesson}`,"回看对应知识 →","text-button"):""}${note(q)}</section>`;
  }
  function inlineQuestion(q) {
    const d=drafts.get(q.id),r=d?.committed?d:!d?state.answers[q.id]:null,c=d?.choice||r?.choice;
    return `<div class="point-example" data-example="${q.id}"><div class="example-heading"><span class="pill">配套判断 · 先独立作答</span></div><h4>${e(q.stem)}</h4>${optionHTML(q,c,!!r,"point-option",!!r)}${r?answerHTML(q,r)+btn("point-retry","再做一次","button secondary small",`data-id="${q.id}"`):btn("point-submit","提交并看解析","button small",`data-id="${q.id}" ${c?"":"disabled"}`)}</div>`;
  }
  function refreshPoint(id) {const el=[...document.querySelectorAll("[data-example]")].find(el=>el.dataset.example===id);if(el)el.outerHTML=inlineQuestion(qm.get(id));}
  function learn(id) {
    const l=lm.get(id)||lm.get(state.lastLesson)||D.lessons[0];state.lastLesson=l.id;persist();
    main.innerHTML=heading("48 LESSONS / 逐条对应新大纲","知识详解","每节对应一个大纲条目；解释概念、机制、应用和易混点。")+
      `<div class="learn-layout"><aside class="panel topic-list" aria-label="48节大纲目录">${D.groups.map(g=>`<h3>${g.id} · ${e(g.title)}</h3>${D.lessons.filter(l=>l.group===g.id).map(x=>`<a class="topic-item ${x.id===l.id?"active":""}" href="#learn/${x.id}" ${x.id===l.id?'aria-current="page"':""}>${state.read[x.id]?"✓ ":""}${String(x.number).padStart(2,"0")} ${e(x.title)}</a>`).join("")}`).join("")}</aside><article class="panel reading"><div class="reading-head"><span class="pill">${e(gm.get(l.group).title)}</span><h2>${String(l.number).padStart(2,"0")} · ${e(l.title)}</h2><p class="muted">原大纲第${l.number}条 · PDF第${l.source_page}页 · ${l.points.length}个教学知识点</p><div class="buttons">${btn("read",state.read[l.id]?"✓ 已读 · 点击取消":"标记为已读","button small",`data-id="${l.id}"`)}${btn("lesson-exam","本节例题独立自测","button secondary small",`data-id="${l.id}"`)}</div></div><div class="prose">${l.points.map((p,i)=>`<section class="knowledge-item"><span class="term-num">${i+1} / ${p.id}</span><h3>${e(p.term)}</h3><div class="point-detail"><p>${e(p.explanation)}</p></div>${inlineQuestion(qm.get(p.example))}</section>`).join("")}</div><div class="reading-bottom">${l.number>1?link(`#learn/L${String(l.number-1).padStart(2,"0")}`,"← 上一节","button secondary small"):"<span></span>"}${l.number<48?link(`#learn/L${String(l.number+1).padStart(2,"0")}`,"下一节 →","button secondary small"):link("#bank","进入固定题背练 →","button")}</div></article></div>`;
  }
  function bank() {
    const categories=[...new Set(D.bank.map(q=>q.category))];
    main.innerHTML=heading("THE ORIGINAL QUESTIONS / 固定原题","先背答案，再自己做。","默认前500道原题；原题顺序、选项与答案均保留。")+
      `<div class="setup-grid"><form id="bank-form" class="panel panel-pad"><h2>选择这次的范围</h2><div class="form-field"><label for="bank-range">原题范围</label><select id="bank-range"><option value="500">前500题 · 默认必背范围</option><option value="563">完整563题</option><option value="extra">补充第501—563题</option></select></div><div class="form-field"><label for="bank-type">题型</label><select id="bank-type"><option value="all">所有题型</option><option value="single">单选 · 245题</option><option value="multiple">多选 · 181题</option><option value="judge">判断题</option></select></div><div class="form-field"><label for="bank-category">内容分类</label><select id="bank-category"><option value="all">所有内容</option>${categories.map(c=>`<option value="${e(c)}">${e(c)}</option>`).join("")}</select></div><div class="form-field"><label for="bank-order">次序与进度筛选</label><select id="bank-order"><option value="sequential">按原题号顺序</option><option value="random">随机次序</option><option value="unmemorized">只看未背题</option><option value="memorized">只练已背题</option><option value="unseen">只练未做题</option><option value="wrong">只练错题</option></select></div><div class="form-field"><label for="bank-count">这组题量</label><select id="bank-count"><option value="all">当前范围全部题</option><option value="20">20题</option><option value="50">50题</option><option value="100">100题</option></select></div><div class="buttons"><button type="submit" name="mode" value="memorize" class="button">先背答案 →</button><button type="submit" name="mode" value="exam" class="button secondary">自己做 · 隐藏答案</button><button type="submit" name="mode" value="practice" class="text-button">逐题练 · 即时解析</button></div><p id="bank-filter-count" class="muted" aria-live="polite" style="margin-top:18px"></p></form><aside class="panel panel-pad"><span class="pill">记答案内容，不只记字母</span><h2 style="margin-top:20px">从背诵到独立回忆</h2><ul class="timeline"><li><b>背诵时显示答案</b>正确选项标绿，显示完整答案内容，可标记已背、收藏与写笔记。</li><li><b>一键转为本组自测</b>同一组题重新作答，答案和解析全部隐藏，交卷后再看结果。</li><li><b>多选要完整选择</b>可同时选择多项；少选、多选均计为本工作台答错。</li><li><b>判断题注意错误命题</b>答案“错误”时，不要直接把题干背成正确知识。</li></ul><div class="tip">原PDF共563题。前500题：245单选、181多选、74判断；额外63题均为判断。这里每题1分、完整匹配计对，仅用于练习。</div>${state.session?`<br>${link("#session","继续上次背练 →","text-button")}`:""}</aside></div>`;updateFilterCount();
  }
  function filteredBank() {
    const val=id=>document.getElementById(id).value,range=val("bank-range"),type=val("bank-type"),cat=val("bank-category"),order=val("bank-order");
    let arr=D.bank.filter(q=>(range==="500"?q.number<=500:range==="extra"?q.number>500:true)&&(type==="all"||q.type===type)&&(cat==="all"||q.category===cat));
    if(order==="unmemorized")arr=arr.filter(q=>!state.memorized[q.id]);
    if(order==="memorized")arr=arr.filter(q=>state.memorized[q.id]);
    if(order==="unseen")arr=arr.filter(q=>!state.answers[q.id]);
    if(order==="wrong")arr=arr.filter(q=>state.answers[q.id]&&!state.answers[q.id].correct);
    return arr;
  }
  function updateFilterCount(){const el=document.getElementById("bank-filter-count");if(el){const n=filteredBank().length;el.textContent=`筛选后有 ${n} 题。${n?"可直接开始，背诵与作答进度分别保存。":"请调整范围或进度筛选。"}`;}}
  function session() {
    const s=state.session;
    if(!s){main.innerHTML=heading("START","还没有开始背练","选择前500题或一个专业章节。")+link("#bank","选择固定题");return;}
    if(s.finished){result();return;}
    showQuestion();
  }
  function showQuestion(review=false) {
    const s=state.session,q=qm.get(s.ids[s.index]),r=s.responses[q.id],memorize=s.mode==="memorize"&&!review,reveal=memorize?!s.hidden:review||(s.mode==="practice"&&r?.committed);
    const index=s.index,done=Object.keys(s.responses).length,mem=s.ids.filter(id=>state.memorized[id]).length;
    main.innerHTML=heading(memorize?"MEMORIZE / 先背":"RECALL / 自己做",e(s.label),memorize?"看完整答案，读懂正确内容；标记已背，再进入同组自测。":review?"已交卷 · 回看答案与自己的选择":s.mode==="exam"?"答案与解析全部隐藏，选好后下一题，最后交卷。":"逐题提交，立即查看答案和解析。",`<span class="pill">${index+1} / ${s.ids.length}</span>`)+
      `<div class="question-layout"><article class="panel question-card"><div class="question-meta"><span>${source(q)}</span>${btn("save",state.saved.includes(q.id)?"★ 已收藏":"☆ 收藏","text-button",`data-id="${q.id}" aria-pressed="${state.saved.includes(q.id)}"`)}</div><h2 class="question-stem">${e(q.stem)}</h2>${q.type==="multiple"?'<div class="tip multi-tip">多选题 · 可以选择多项，完整匹配才计对。</div>':""}${optionHTML(q,memorize?null:r?.choice,reveal,"option",memorize||review||!!(s.mode==="practice"&&r?.committed))}`+
      (memorize?`<div class="memorize-controls buttons">${btn("memorized",state.memorized[q.id]?"✓ 已背 · 点击取消":"标记这题已背","button",`data-id="${q.id}" aria-pressed="${!!state.memorized[q.id]}"`)}${btn("hide",s.hidden?"显示答案":"遮住答案，试着回忆","button secondary")}</div>${reveal?answerHTML(q):'<p class="hidden-answer" role="status">答案已遮住，试着说出正确内容，再点击“显示答案”。</p>'}`:reveal?answerHTML(q,r):"")+
      `<div class="question-actions"><div class="buttons">${btn("prev","← 上一题","button secondary",index===0?"disabled":"")}${btn("next","下一题 →","button secondary",index===s.ids.length-1?"disabled":"")}</div>${memorize?btn("same-exam","本组自己做 →","button"):review?btn("result","回到结果"):s.mode==="practice"&&!r?.committed?btn("commit","提交答案","button",r?.choice?"":"disabled"):btn("finish",s.mode==="exam"?"交卷并评分":"结束本组")}</div>${!memorize&&!review&&s.mode==="practice"&&!r?.committed?`<div class="buttons">${btn("finish","结束本组练习","text-button")}</div>`:""}</article>`+
      `<aside class="panel question-map"><h3>${memorize?"背诵目录":"答题卡"}</h3><p class="muted">${memorize?`本组已背${mem}`:`已选${done}`} / ${s.ids.length}题</p><label class="sr-only" for="jump-number">跳转本组位置</label><form id="jump-form" class="jump-controls"><input id="jump-number" type="number" min="1" max="${s.ids.length}" value="${index+1}" aria-label="本组位置"><button class="button secondary small" type="submit">跳转</button></form><div class="map-grid">${s.ids.map((id,i)=>{const rr=s.responses[id],known=review||(s.mode==="practice"&&rr?.committed);return btn("jump",qm.get(id).origin?i+1:qm.get(id).number,`map-cell ${i===index?"current":""} ${memorize?state.memorized[id]?"answered":"":rr?"answered":""} ${known&&rr?rr.choice===qm.get(id).answer?"correct":"wrong":""}`,`data-index="${i}" aria-label="本组第${i+1}题，${qm.get(id).origin?"专业例题":`原题第${qm.get(id).number}题`}"`);}).join("")}</div><p class="map-legend">${memorize?"浅蓝：已背 · 蓝框：当前题":review||s.mode==="practice"?"浅绿：答对 · 浅红：答错 · 灰色：未答":"浅蓝：已选 · 蓝框：当前题，交卷前不显示对错。"}</p>${memorize?btn("same-exam","本组独立自测","button secondary small"):review?btn("result","查看结果","button secondary small"):btn("finish",s.mode==="exam"?"交卷并评分":"结束本组","button secondary small")}${link("#bank","返回范围选择","text-button")}</aside></div>`;
  }
  function finish() {
    const s=state.session;if(!s||s.finished||s.mode==="memorize")return;
    const missing=s.ids.filter(id=>!s.responses[id]?.choice||(s.mode==="practice"&&!s.responses[id]?.committed)).length;
    ask(s.mode==="exam"?"确认交卷？":"结束这组练习？",missing?`还有${missing}题${s.mode==="exam"?"未作答":"未提交"}，本次按0分计，之后可重做。`:"答案将显示，结果会保存到学习记录。",()=>{
      if(s.mode==="exam")for(const id of s.ids){const r=s.responses[id];if(r){r.committed=true;record(qm.get(id),r.choice);}}
      s.finished=true;const right=s.ids.filter(id=>s.responses[id]?.committed&&s.responses[id].choice===qm.get(id).answer).length;
      state.history.push({label:s.label,right,total:s.ids.length,at:Date.now()});state.history=state.history.slice(-50);persist();render();
    });
  }
  function result() {
    const s=state.session,right=s.ids.filter(id=>s.responses[id]?.committed&&s.responses[id].choice===qm.get(id).answer).length,done=s.ids.filter(id=>s.responses[id]?.committed).length,missing=s.ids.length-done;
    main.innerHTML=heading("YOUR RESULT / 检验记忆","本次完成，回看薄弱处。",e(s.label))+`<div class="panel result-summary"><span class="pill green">已交卷</span><div class="result-score">${right}<small> / ${s.ids.length}</small></div><p>答对${right}题 · 答错${done-right}题 · 未提交${missing}题</p><p>多选完整匹配计对；每题1分仅为练习规则。</p><div class="buttons">${btn("review","逐题看答案 →")}${btn("retry","错题与未答题再做","button secondary")}${btn("same-memorize","回到本组背诵","button secondary")}${link("#bank","选择下一组","button secondary")}</div></div><div class="section-head"><h2>本组各题型表现</h2></div><div class="panel">${["single","multiple","judge"].map(type=>{const ids=s.ids.filter(id=>qm.get(id).type===type);if(!ids.length)return"";const n=ids.filter(id=>s.responses[id]?.committed&&s.responses[id].choice===qm.get(id).answer).length;return `<div class="list-row"><div class="list-body"><h3>${typeName[type]}</h3><small>${n}/${ids.length}题正确</small></div>${progress(n,ids.length)}</div>`;}).join("")}</div>`;
  }
  function collection(kind) {
    if(collectionKind!==kind){listPage=1;collectionKind=kind;}
    const ids=kind==="wrong"?wrong():state.saved, pages=Math.max(1,Math.ceil(ids.length/20));listPage=Math.min(listPage,pages);
    main.innerHTML=heading(kind==="wrong"?"REVISIT":"BOOKMARKS",kind==="wrong"?"我的错题":"我的收藏",kind==="wrong"?"保留最近一次提交的错误；重做答对后移出。":"收藏重点，可集中背诵或独立作答。")+(ids.length?`<div class="buttons collection-actions">${btn("collection-mem","先背当前列表","button",`data-kind="${kind}"`)}${btn("collection-exam","自己做当前列表","button secondary",`data-kind="${kind}"`)}</div><div class="panel">${ids.slice((listPage-1)*20,listPage*20).map(id=>{const q=qm.get(id);return `<article class="list-row"><span class="row-id">${q.id}</span><div class="list-body"><h3>${e(q.stem)}</h3><small>${source(q)}</small></div><div class="buttons">${btn("one-mem","背这题","button secondary small",`data-id="${q.id}"`)}${btn("one-practice","重做","button secondary small",`data-id="${q.id}"`)}</div></article>`;}).join("")}</div><div class="pagination">${btn("page-prev","← 上页","button secondary small",listPage===1?"disabled":"")}<span>${listPage}/${pages}页 · ${ids.length}题</span>${btn("page-next","下页 →","button secondary small",listPage===pages?"disabled":"")}</div>`:`<div class="panel empty"><h2>${kind==="wrong"?"暂时没有错题":"还没有收藏"}</h2><p>开始背题或独立作答，重点会整理到这里。</p>${link("#bank","进入固定题背练")}</div>`);
  }
  function settings() {
    main.innerHTML=heading("YOUR DATA & SOURCE","记录管理与大纲来源","新大纲的记录与旧版分开保存，电脑和平板可导出、导入迁移。")+
      `<div class="settings-grid"><section class="panel panel-pad"><h2>学习记录备份</h2><p class="muted">保存已读、已背、答题、收藏、笔记与当前背练位置。导入会替换本版当前记录。</p><div class="buttons">${btn("export","导出记录")}${btn("import","导入记录","button secondary")}</div><p class="muted" style="margin-top:20px">${storage?"当前浏览器可以保存记录。":"当前无法持久保存，请及时导出。"}不同设备和浏览器不自动同步。</p></section><section class="panel panel-pad"><h2>本版内容</h2><p>10方向 · 48节 · ${D.stats.points}知识点与原创例题<br>固定原题：563题，默认前500题。</p>${btn("reset","清空本版学习记录","button secondary small")}</section></div><div class="section-head"><h2>依据与范围</h2></div><div class="panel panel-pad prose"><h3>华电集团笔试大纲(1).pdf</h3><p>共161页。计算机类专业版在PDF第23—25页，专业知识70%、通用类知识30%。固定公共与行业题库在PDF第40—161页。这里的PDF页序比印刷页码大1。</p><p>固定题第1—245为单选，第246—426为多选，第427—563为判断。原题答案保持PDF原文；文字仅去除页脚和排版换行，不自行改写原题。</p><p>专业讲解和配套例题是按大纲编写的教学展开，不是官方原题，不承诺穷尽所有可能命题。其他通用能力题未另编题库。</p><p>“固定题必考占5分”来自你的说明，本PDF未找到对应分值条款。练习使用每题1分，多选必须完整匹配，不能据此推断官方计分。</p></div><div class="section-head"><h2>最近练习</h2></div><div class="panel">${state.history.length?state.history.slice(-10).reverse().map(h=>`<div class="list-row"><div class="list-body"><h3>${e(h.label)}</h3><small>${new Date(h.at).toLocaleString("zh-CN")} · ${h.right}/${h.total}题正确</small></div></div>`).join(""):'<div class="panel-pad muted">还没有交卷记录。</div>'}</div>`;
  }
  function render() {
    const parts=location.hash.slice(1).split("/"),page=parts[0]||"home";
    const label={home:"学习总览",learn:"48节知识详解",bank:"固定题背练",session:"本组背练",review:"回看答案",wrong:"我的错题",saved:"我的收藏",settings:"记录管理"}[page]||"学习总览";
    document.title=label+" · 华电计算机复习工作台";document.querySelector("#page-label").textContent=label;
    document.querySelectorAll("[data-page]").forEach(a=>{const active=a.dataset.page===page||(a.dataset.page==="bank"&&["session","review"].includes(page));a.classList.toggle("active",active);if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");});
    document.querySelector("#sidebar").classList.remove("open");document.querySelector(".menu-toggle").setAttribute("aria-expanded","false");
    try {
      if(page==="learn")learn(parts[1]);else if(page==="bank")bank();else if(page==="session")session();else if(page==="review"&&state.session?.finished)showQuestion(true);else if(["wrong","saved"].includes(page))collection(page);else if(page==="settings")settings();else home();
    } catch(err) {console.error(err);main.innerHTML='<div class="panel empty"><h1>页面暂时无法显示</h1><p>请返回总览再试，已保存的记录仍保留。</p><a class="button" href="#home">返回总览</a></div>';}
  }
  function search() {
    const term=document.getElementById("search-input").value.trim().toLowerCase(),out=document.getElementById("search-results");
    if(!term){out.innerHTML='<p class="muted">输入知识词、题号HD246或原题数字。</p>';return;}
    const ls=D.lessons.filter(l=>[l.title,...l.points.map(p=>p.term+" "+p.explanation)].join(" ").toLowerCase().includes(term));
    const b=D.bank.filter(q=>q.id.toLowerCase()===term||String(q.number)===term||q.stem.toLowerCase().includes(term));
    out.innerHTML=`<p class="muted">找到${ls.length+b.length}项，最多先显示50项。</p>`+[...ls.map(l=>link(`#learn/${l.id}`,`<small>大纲第${l.number}条</small>${e(l.title)}`,"search-result")),...b.map(q=>btn("search-question",`<small>原题${q.number} · ${typeName[q.type]}</small>${e(q.stem)}`,"search-result",`data-id="${q.id}"`))].slice(0,50).join("");
  }
  document.addEventListener("click",ev=>{
    if(ev.target.closest("#search-results a"))document.getElementById("search-dialog").close();
    const b=ev.target.closest("[data-action]");if(!b||b.disabled)return;
    const a=b.dataset.action,id=b.dataset.id,s=state.session;
    if(a==="menu"){const open=document.getElementById("sidebar").classList.toggle("open");b.setAttribute("aria-expanded",String(open));}
    else if(a==="search"){document.getElementById("search-dialog").showModal();search();document.getElementById("search-input").focus();}
    else if(a==="close-search")document.getElementById("search-dialog").close();
    else if(a==="cancel"){document.getElementById("confirm-dialog").close();callback=null;}
    else if(a==="confirm"){document.getElementById("confirm-dialog").close();const fn=callback;callback=null;fn?.();}
    else if(a==="read"){if(state.read[id])delete state.read[id];else state.read[id]=true;persist();render();}
    else if(a==="lesson-exam"){const l=lm.get(id);start(l.points.map(p=>p.example),"exam",`第${l.number}节 · ${l.title}`);}
    else if(a==="point-option"){drafts.set(id,{choice:b.dataset.choice,committed:false});refreshPoint(id);}
    else if(a==="point-submit"){const d=drafts.get(id);if(d?.choice&&!d.committed){d.committed=true;record(qm.get(id),d.choice);persist();refreshPoint(id);}}
    else if(a==="point-retry"){drafts.set(id,{choice:null,committed:false});refreshPoint(id);}
    else if(a==="save"){const i=state.saved.indexOf(id);if(i<0)state.saved.push(id);else state.saved.splice(i,1);persist();render();}
    else if(a==="memorized"){if(state.memorized[id])delete state.memorized[id];else state.memorized[id]=true;persist();render();}
    else if(a==="hide"&&s){s.hidden=!s.hidden;persist();render();}
    else if(a==="same-exam"&&s)start(s.ids.slice(),"exam",s.label.replace(/ · 背诵$| · 即时练习$| · 独立自测$/g,"")+" · 独立自测");
    else if(a==="same-memorize"&&s)start(s.ids.slice(),"memorize",s.label.replace(/ · 独立自测$/,"")+" · 背诵");
    else if(a==="option"&&s&&!s.finished&&s.mode!=="memorize"){const q=qm.get(s.ids[s.index]),r=s.responses[q.id];if(r?.committed)return;const old=r?.choice||"",v=b.dataset.choice;const choice=q.type==="multiple"?(old.includes(v)?old.replace(v,""):old+v).split("").sort().join(""):v;if(choice)s.responses[q.id]={choice,committed:false};else delete s.responses[q.id];persist();render();}
    else if(a==="commit"&&s&&!s.finished){const q=qm.get(s.ids[s.index]),r=s.responses[q.id];if(r?.choice&&!r.committed){r.committed=true;record(q,r.choice);persist();render();}}
    else if(["prev","next","jump"].includes(a)&&s){s.index=a==="jump"?Number(b.dataset.index):Math.max(0,Math.min(s.ids.length-1,s.index+(a==="next"?1:-1)));s.hidden=false;persist();if(location.hash==="#review")showQuestion(true);else render();}
    else if(a==="finish")finish();
    else if(a==="review"&&s){s.index=0;persist();location.hash="#review";}
    else if(a==="result")location.hash="#session";
    else if(a==="retry"&&s)start(s.ids.filter(id=>!s.responses[id]?.committed||s.responses[id].choice!==qm.get(id).answer),"exam","本组错题与未答题 · 独立自测");
    else if(a==="one-mem"||a==="search-question"){document.getElementById("search-dialog").close();start([id],"memorize",`单题${id} · 背诵`);}
    else if(a==="one-practice")start([id],"practice",`单题${id} · 即时练习`);
    else if(a==="collection-mem"||a==="collection-exam"){const ids=b.dataset.kind==="wrong"?wrong():state.saved;start(ids.slice(),a==="collection-mem"?"memorize":"exam",b.dataset.kind==="wrong"?"我的错题":"我的收藏");}
    else if(a==="page-prev"||a==="page-next"){listPage+=a==="page-next"?1:-1;render();}
    else if(a==="export"){const u=URL.createObjectURL(new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"})),anchor=document.createElement("a");anchor.href=u;anchor.download="华电新大纲-学习记录.json";anchor.click();setTimeout(()=>URL.revokeObjectURL(u),1000);toast("学习记录已导出。");}
    else if(a==="import")document.getElementById("import-file").click();
    else if(a==="reset")ask("清空本版学习记录？","已读、已背、答题、收藏与笔记会清空。建议先导出备份；不会删除知识、题库或旧版记录。",()=>{state=fresh();drafts.clear();persist();render();});
  });
  document.addEventListener("submit",ev=>{
    if(ev.target.id==="jump-form"){ev.preventDefault();const n=Number(document.getElementById("jump-number").value);if(Number.isInteger(n)&&n>=1&&n<=state.session.ids.length){state.session.index=n-1;state.session.hidden=false;persist();location.hash==="#review"?showQuestion(true):render();}return;}
    if(ev.target.id!=="bank-form")return;ev.preventDefault();
    let arr=filteredBank();if(document.getElementById("bank-order").value==="random")arr=shuffle(arr);
    const count=document.getElementById("bank-count").value;if(count!=="all")arr=arr.slice(0,Number(count));
    const mode=ev.submitter?.value||"memorize",names={memorize:"背诵",practice:"即时练习",exam:"独立自测"};
    start(arr.map(q=>q.id),mode,`固定原题 · ${arr.length}题 · ${names[mode]}`);
  });
  document.addEventListener("input",ev=>{if(ev.target.dataset.note){state.notes[ev.target.dataset.note]=ev.target.value;persist();}if(ev.target.id==="search-input"){clearTimeout(searchTimer);searchTimer=setTimeout(search,130);}});
  document.addEventListener("change",async ev=>{
    if(ev.target.closest("#bank-form"))updateFilterCount();
    if(ev.target.id!=="import-file")return;const file=ev.target.files[0];ev.target.value="";if(!file)return;
    if(file.size>8000000){toast("文件过大，请使用本工作台导出的JSON。");return;}
    try{const incoming=normalize(JSON.parse(await file.text()));ask("导入并替换记录？",`将导入${Object.keys(incoming.read).length}节阅读、${Object.keys(incoming.memorized).length}道已背及${Object.keys(incoming.answers).length}道答题记录。`,()=>{state=incoming;drafts.clear();persist();render();toast("导入完成。");});}catch{toast("记录不兼容，请选择华电新大纲版导出的JSON。");}
  });
  document.addEventListener("keydown",ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==="k"){ev.preventDefault();document.getElementById("search-dialog").showModal();search();document.getElementById("search-input").focus();}if(ev.key==="Escape"){document.getElementById("sidebar").classList.remove("open");document.querySelector(".menu-toggle").setAttribute("aria-expanded","false");}});
  window.addEventListener("hashchange",()=>{window.scrollTo(0,0);render();});
  window.addEventListener("storage",ev=>{if(ev.key===KEY&&ev.newValue){try{state=normalize(JSON.parse(ev.newValue));drafts.clear();render();}catch{}}});
  document.getElementById("chapter-nav").innerHTML=D.groups.map(g=>link(`#learn/${D.lessons.find(l=>l.group===g.id).id}`,`<span>${g.id}</span>${e(g.title)}`,"chapter-nav-link")).join("");
  persist();render();
})();
