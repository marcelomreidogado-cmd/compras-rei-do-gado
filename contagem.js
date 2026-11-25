/* Contagem de estoque v3.2 (25/11/2026)
   Lista de contagem por loja e data, com responsável. Compara o que foi contado com o estoque do sistema
   (planilha importada no dia) e guarda o histórico. Cada número digitado grava só aquele item:
     compras_gerencial_v3/counts/<id>                 { date, store, responsible, status, baseImportedAt, items:{código:{...}} }
     compras_gerencial_v3/counts/<id>/items/<código>  { name, family, unit, system, cost, counted, at, by }
     compras_gerencial_v3/countLists/<id>             listas salvas { name, codes[] } (ex.: "Molhos", "Terça: carvão, contra grill, chorizo") */
let countUi={view:'list',id:'',store:'all',draft:null,onlyDiff:false,historyCode:''};
const countRef=path=>fbDB.ref(CENTRAL_PATH+'/'+path);
const todayIso=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);};
function countsList(){return Object.entries(app.counts||{}).map(([id,c])=>({id,...c})).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));}
function countItems(c){return Object.entries(c?.items||{}).map(([code,i])=>({code,...i})).sort((a,b)=>(a.family||'').localeCompare(b.family||'','pt-BR')||(a.name||'').localeCompare(b.name||'','pt-BR'));}
function countDiff(i){return i.counted==null||i.counted===''?null:num(i.counted)-num(i.system);}
function countStats(c){const items=countItems(c);let counted=0,withDiff=0,out=0,inn=0;for(const i of items){const d=countDiff(i);if(d==null)continue;counted++;if(Math.abs(d)>(i.unit==='un'?0:.005)){withDiff++;const v=d*num(i.cost);if(v<0)out+=-v;else inn+=v;}}return{total:items.length,counted,withDiff,out,inn,net:inn-out};}
function parseCountInput(text,unit){const t=String(text??'').trim();if(!t)return null;const n=Number(t.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(n))return undefined;return unit==='un'?Math.round(n):Math.round(n*1000)/1000;}

/* ---------- render ---------- */
function renderCounts(){
  const root=document.getElementById('countRoot');if(!root)return;
  const focus=document.activeElement?.dataset?.code?{code:document.activeElement.dataset.code,pos:document.activeElement.selectionEnd}:null;
  root.innerHTML=countUi.view==='new'?countNewHtml():countUi.view==='count'&&app.counts?.[countUi.id]?countDetailHtml():countListHtml();
  if(countUi.view==='new')bindCountNew();
  if(focus){const el=root.querySelector(`input[data-code="${CSS.escape(focus.code)}"]`);if(el){el.focus();try{el.setSelectionRange(focus.pos,focus.pos);}catch(e){}}}
}
function countListHtml(){
  const all=countsList().filter(c=>countUi.store==='all'||c.store===countUi.store),lists=Object.entries(app.countLists||{});
  const storeChips=[['all','Todas as lojas'],...STORE_IDS.map(s=>[s,STORES[s]])].map(([k,l])=>`<button type="button" class="pk-chip st-store${countUi.store===k?' on':''}" aria-pressed="${countUi.store===k}" onclick="countUi.store='${k}';renderCounts()">${k!=='all'?`<i class="op3-dot" style="background:${STORE_COLORS[k]}"></i>`:''}${esc(l)}</button>`).join('');
  const rows=all.map(c=>{const st=countStats(c);return`<tr class="ct-row" onclick="openCount('${c.id}')"><td>${formatDate(c.date)}</td><td><i class="op3-dot" style="background:${STORE_COLORS[c.store]}"></i>${esc(STORES[c.store]||c.store)}</td><td class="op3-name"><b>${esc(c.title||'Contagem')}</b><small>${esc(c.responsible||'')}</small></td><td class="num">${st.counted}/${st.total}</td><td class="num">${st.withDiff?`<span class="op3-net down">${st.withDiff}</span>`:'0'}</td><td class="num">${st.out?`<span class="op3-net down">−${fmtMoney(st.out)}</span>`:'—'}</td><td class="num">${st.inn?`<span class="op3-net up">+${fmtMoney(st.inn)}</span>`:'—'}</td><td>${c.status==='closed'?'<span class="ct-badge done">✓ Finalizada</span>':'<span class="ct-badge open">Em andamento</span>'}</td></tr>`;}).join('');
  return`<div class="st-filters"><div class="pk-row">${storeChips}</div><button class="btn primary" type="button" onclick="startNewCount()">＋ Nova contagem</button></div>
  ${lists.length?`<div class="ct-lists"><b>Listas salvas:</b>${lists.map(([id,l])=>`<span class="ct-list"><button type="button" class="pk-chip" onclick="startNewCount({listId:'${id}'})">📋 ${esc(l.name)} <strong>${(l.codes||[]).length}</strong></button><button type="button" class="ct-x" title="Apagar lista" aria-label="Apagar lista ${esc(l.name)}" onclick="deleteCountList('${id}')">×</button></span>`).join('')}</div>`:''}
  <div class="card op3-card"><div class="cardhead"><h2>📋 Histórico de contagens</h2><span>${all.length} contagem(ns)</span></div><div class="cardbody">${all.length?`<div class="tablewrap op3-tw"><table class="op3-tbl ct-tbl"><thead><tr><th>Data</th><th>Loja</th><th>Contagem / responsável</th><th class="num">Contados</th><th class="num">Com diferença</th><th class="num">Falta (R$)</th><th class="num">Sobra (R$)</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div>`:empty('Nenhuma contagem ainda','Clique em "Nova contagem", escolha a loja, as famílias ou os produtos e o responsável.')}</div></div>`;
}
function countNewHtml(){
  const d=countUi.draft,fams=familyList(),picked=new Set(d.codes),pool=visibleProducts();
  const famChips=fams.map(f=>{const codes=pool.filter(p=>p.familia===f).map(p=>String(p.codigo_produto)),n=codes.filter(c=>picked.has(c)).length,all=n&&n===codes.length;return`<button type="button" class="pk-chip${all?' on':''}" aria-pressed="${!!all}" onclick="toggleCountFamily('${encodeURIComponent(f)}')">${familyIcon(f)} ${esc(f)}<strong>${n}/${codes.length}</strong></button>`;}).join('');
  const q=norm(d.query||''),found=q?pool.filter(p=>norm(p.produto+' '+p.codigo_produto).includes(q)).slice(0,12):[];
  const chosen=pool.filter(p=>picked.has(String(p.codigo_produto)));
  return`<div class="card op3-card"><div class="cardhead"><h2>＋ Nova contagem</h2><button class="btn sm" type="button" onclick="countUi.view='list';renderCounts()">Voltar</button></div><div class="cardbody">
  <div class="ct-form"><label>Data<input id="ctDate" type="date" value="${esc(d.date)}"></label><label>Loja<select id="ctStore">${STORE_IDS.map(s=>`<option value="${s}"${d.store===s?' selected':''}>${esc(STORES[s])}</option>`).join('')}</select></label><label>Responsável pela contagem<input id="ctResp" type="text" autocomplete="name" placeholder="Nome de quem vai contar" value="${esc(d.responsible)}"></label><label>Nome da contagem (opcional)<input id="ctTitle" type="text" placeholder="Ex.: Molhos, Terça: carvão e contra grill" value="${esc(d.title)}"></label></div>
  <p class="ct-step"><b>1.</b> Escolha famílias inteiras</p><div class="pk-row ct-fams">${famChips}</div>
  <p class="ct-step"><b>2.</b> Ou adicione produtos um a um</p><div class="search"><input id="ctSearch" type="search" placeholder="Buscar produto ou código…" value="${esc(d.query||'')}" aria-label="Buscar produto para adicionar"></div>
  ${found.length?`<div class="ct-found">${found.map(p=>`<button type="button" class="pk-chip${picked.has(String(p.codigo_produto))?' on':''}" onclick="toggleCountProduct('${encodeURIComponent(p.codigo_produto)}')">${picked.has(String(p.codigo_produto))?'✓ ':'＋ '}${esc(p.produto)}</button>`).join('')}</div>`:''}
  <p class="ct-step"><b>3.</b> Produtos na lista: <b>${chosen.length}</b></p>
  <div class="ct-chosen">${chosen.length?chosen.map(p=>`<span class="ct-pill">${esc(p.produto)}<button type="button" aria-label="Tirar ${esc(p.produto)}" onclick="toggleCountProduct('${encodeURIComponent(p.codigo_produto)}')">×</button></span>`).join(''):'<span class="op3-muted">Nenhum produto escolhido.</span>'}</div>
  <div class="ct-actions"><label class="ct-save"><input id="ctSaveList" type="checkbox"${d.saveList?' checked':''}> Salvar esta lista para usar de novo</label><button class="btn primary" type="button" onclick="createCount()"${chosen.length?'':' disabled'}>Criar contagem com ${chosen.length} produto(s)</button></div>
  </div></div>`;
}
function countDetailHtml(){
  const c=app.counts[countUi.id],closed=c.status==='closed',st=countStats(c),items=countItems(c).filter(i=>!countUi.onlyDiff||Math.abs(countDiff(i)||0)>0);
  let fam='';const rows=items.map(i=>{const d=countDiff(i),cls=d==null?'':Math.abs(d)<=(i.unit==='un'?0:.005)?'ok':d<0?'down':'up',head=i.family!==fam?(fam=i.family,`<tr class="ct-fam"><td colspan="6">${familyIcon(i.family)} ${esc(i.family||'Sem família')}</td></tr>`):'';
    return head+`<tr><td class="op3-name ct-name"><button type="button" class="op3-link" onclick="showCountHistory('${encodeURIComponent(i.code)}')">${esc(i.name)}</button><small>${esc(i.code)} · ${i.unit}</small></td><td class="num">${unitQty(i.system,i.unit)}</td><td class="num ct-in">${closed?`<b>${i.counted==null?'—':unitQty(i.counted,i.unit)}</b>`:`<input type="text" inputmode="decimal" data-code="${esc(i.code)}" value="${i.counted==null?'':String(i.counted).replace('.',',')}" placeholder="—" aria-label="Contado de ${esc(i.name)}" onchange="saveCountValue(this)" onkeydown="countKey(event,this)">`}</td><td class="num"><span class="op3-net ${cls==='down'?'down':cls==='up'?'up':''}">${d==null?'—':cls==='ok'?'✓ igual':(d>0?'+':'−')+unitQty(Math.abs(d),i.unit)}</span></td><td class="num">${d==null||cls==='ok'||!i.cost?'—':`<span class="op3-net ${cls}">${d>0?'+':'−'}${fmtMoney(Math.abs(d*i.cost))}</span>`}</td><td class="op3-muted ct-by">${i.counted!=null&&i.by?esc(String(i.by).split('@')[0]):''}</td></tr>`;}).join('');
  return`<div class="card op3-card"><div class="cardhead"><div><h2>📋 ${esc(c.title||'Contagem')} · ${esc(STORES[c.store]||'')}</h2><span>${formatDate(c.date)} · responsável <b>${esc(c.responsible||'')}</b> · estoque do sistema da planilha de ${esc(formatImportMoment(c.baseImportedAt)||'—')}</span></div><button class="btn sm" type="button" onclick="countUi.view='list';renderCounts()">Voltar</button></div><div class="cardbody">
  <div class="op3-kpis ct-kpis">${opKpi('Contados',`${st.counted}/${st.total}`,st.total-st.counted?`faltam ${st.total-st.counted}`:'lista completa')}${opKpi('Com diferença',st.withDiff,'itens a corrigir no sistema',st.withDiff?'':'',st.withDiff?'warn':'')}${opKpi('Falta',st.out?'−'+fmtMoney(st.out):'R$ 0','contado abaixo do sistema')}${opKpi('Sobra',st.inn?'+'+fmtMoney(st.inn):'R$ 0','contado acima do sistema')}</div>
  <div class="ct-bar"><label class="ct-save"><input type="checkbox"${countUi.onlyDiff?' checked':''} onchange="countUi.onlyDiff=this.checked;renderCounts()"> Mostrar só os itens com diferença</label><span class="op3-muted">${closed?'Contagem finalizada (somente leitura).':'Digite o que foi contado; Enter vai para o próximo. Grava na hora em todos os aparelhos.'}</span></div>
  <div class="tablewrap op3-tw"><table class="op3-tbl ct-tbl"><thead><tr><th>Produto</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th><th class="num">Diferença R$</th><th>Por</th></tr></thead><tbody>${rows||`<tr><td colspan="6">${empty('Nenhum item com diferença','')}</td></tr>`}</tbody></table></div>
  <div class="ct-actions">${closed?`<button class="btn" type="button" onclick="setCountStatus('open')">Reabrir contagem</button>`:`<button class="btn" type="button" onclick="deleteCount()">Apagar contagem</button><button class="btn primary" type="button" onclick="setCountStatus('closed')">✓ Finalizar contagem</button>`}<button class="btn sm" type="button" onclick="shareCountWhatsApp()">Enviar diferenças no WhatsApp</button></div>
  ${countUi.historyCode?countHistoryHtml(countUi.historyCode,c.store):''}</div></div>`;
}
function countHistoryHtml(code,store){
  const list=countsList().filter(c=>c.store===store&&c.items?.[code]&&c.items[code].counted!=null).slice(0,12),name=app.counts[countUi.id]?.items?.[code]?.name||code;
  return`<div class="ct-hist"><div class="cardhead"><h2>Histórico de ${esc(name)} · ${esc(STORES[store])}</h2><button class="btn sm" type="button" onclick="countUi.historyCode='';renderCounts()">Fechar</button></div>${list.length?`<table class="op3-tbl"><thead><tr><th>Data</th><th>Responsável</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th></tr></thead><tbody>${list.map(c=>{const i=c.items[code],d=countDiff(i);return`<tr><td>${formatDate(c.date)}</td><td>${esc(c.responsible||'')}</td><td class="num">${unitQty(i.system,i.unit)}</td><td class="num">${unitQty(i.counted,i.unit)}</td><td class="num"><span class="op3-net ${d<0?'down':d>0?'up':''}">${d===0?'✓':(d>0?'+':'−')+unitQty(Math.abs(d),i.unit)}</span></td></tr>`;}).join('')}</tbody></table>`:'<p class="op3-muted">Ainda sem outras contagens deste produto nesta loja.</p>'}</div>`;
}

/* ---------- ações ---------- */
function startNewCount(opts={}){
  const last=countsList()[0],list=opts.listId?app.countLists?.[opts.listId]:null;
  countUi.draft={date:todayIso(),store:opts.store||last?.store||'001',responsible:'',title:list?.name||opts.title||'',codes:[...(list?.codes||opts.codes||[])].map(String),query:'',saveList:false,listId:opts.listId||''};
  countUi.view='new';navigate('count');
}
function bindCountNew(){
  const d=countUi.draft,bind=(id,key)=>document.getElementById(id)?.addEventListener('input',e=>{d[key]=e.target.value;});
  bind('ctDate','date');bind('ctResp','responsible');bind('ctTitle','title');document.getElementById('ctStore').onchange=e=>{d.store=e.target.value;};document.getElementById('ctSaveList').onchange=e=>{d.saveList=e.target.checked;};
  const s=document.getElementById('ctSearch');s.oninput=e=>{d.query=e.target.value;clearTimeout(countUi.t);countUi.t=setTimeout(()=>{renderCounts();const el=document.getElementById('ctSearch');el.focus();el.setSelectionRange(el.value.length,el.value.length);},250);};
}
function toggleCountFamily(encoded){const f=decodeURIComponent(encoded),d=countUi.draft,codes=visibleProducts().filter(p=>p.familia===f).map(p=>String(p.codigo_produto)),all=codes.every(c=>d.codes.includes(c));d.codes=all?d.codes.filter(c=>!codes.includes(c)):[...new Set([...d.codes,...codes])];if(!d.title&&!all)d.title=f;renderCounts();}
function toggleCountProduct(encoded){const c=decodeURIComponent(encoded),d=countUi.draft;d.codes=d.codes.includes(c)?d.codes.filter(x=>x!==c):[...d.codes,c];renderCounts();}
async function createCount(){
  const d=countUi.draft;if(!d.responsible.trim())return showToast('Informe o responsável','Coloque o nome de quem vai contar.','error');if(!d.date)return showToast('Informe a data','','error');
  if(!syncReady||!currentUser)return showToast('Sem conexão com a base central','Aguarde e tente de novo.','error');
  const items={};for(const code of d.codes){const p=app.products.find(x=>String(x.codigo_produto)===code);if(!p)continue;const unit=productMeasureUnit(p);items[code]={name:p.produto,family:p.familia,unit,system:unit==='un'?Math.round(num(p['estoque_atual_'+d.store])):num(p['estoque_atual_'+d.store]),cost:num(p['custo_atual_'+d.store]),counted:null};}
  const ref=countRef('counts').push(),now=new Date().toISOString(),count={date:d.date,store:d.store,responsible:d.responsible.trim(),title:d.title.trim(),status:'open',createdAt:now,createdBy:currentUser.email||'',baseImportedAt:app.meta?.importedAt||'',items};
  try{const updates={['counts/'+ref.key]:cleanJson(count)};if(d.saveList){const lid=d.listId||countRef('countLists').push().key;updates['countLists/'+lid]={name:d.title.trim()||'Lista sem nome',codes:Object.keys(items),updatedAt:now};}
    await fbDB.ref(CENTRAL_PATH).update(updates);app.counts={...(app.counts||{}),[ref.key]:count};countUi={...countUi,view:'count',id:ref.key,draft:null,historyCode:''};renderCounts();showToast('Contagem criada',`${Object.keys(items).length} produtos · ${STORES[d.store]} · ${d.responsible}`);}
  catch(error){showToast('Não foi possível criar a contagem',firebaseErrorMessage(error),'error');}
}
function openCount(id){countUi={...countUi,view:'count',id,historyCode:'',onlyDiff:false};renderCounts();window.scrollTo(0,0);}
async function saveCountValue(input){
  const c=app.counts?.[countUi.id],code=input.dataset.code,item=c?.items?.[code];if(!item||c.status==='closed')return;
  const value=parseCountInput(input.value,item.unit);if(value===undefined){input.classList.add('bad');return showToast('Número inválido',`Use só números (ex.: 12 ou 3,5) em ${item.name}.`,'error');}input.classList.remove('bad');
  if(value===item.counted)return;const data={...item,counted:value,at:value==null?null:new Date().toISOString(),by:value==null?null:(currentUser?.email||'')};
  c.items[code]=data;renderCounts();
  try{await countRef(`counts/${countUi.id}/items/${code}`).update({counted:value,at:data.at,by:data.by});}catch(error){showToast('Não foi salvo',`${item.name}: ${firebaseErrorMessage(error)}`,'error');}
}
function countKey(e,input){if(e.key!=='Enter')return;e.preventDefault();const all=[...document.querySelectorAll('#countRoot input[data-code]')],next=all[all.indexOf(input)+1];input.blur();setTimeout(()=>{const el=next&&document.querySelector(`#countRoot input[data-code="${CSS.escape(next.dataset.code)}"]`);el?.focus();el?.select();},30);}
async function setCountStatus(status){const c=app.counts?.[countUi.id];if(!c)return;if(status==='closed'){const st=countStats(c);if(st.counted<st.total&&!confirm(`Faltam ${st.total-st.counted} itens sem contagem. Finalizar assim mesmo?`))return;}
  try{await countRef('counts/'+countUi.id).update({status,closedAt:status==='closed'?new Date().toISOString():null,closedBy:status==='closed'?(currentUser?.email||''):null});c.status=status;renderCounts();showToast(status==='closed'?'Contagem finalizada':'Contagem reaberta',status==='closed'?'Agora corrija as diferenças no inventário do Alterdata.':'');}catch(error){showToast('Não foi possível alterar',firebaseErrorMessage(error),'error');}}
async function deleteCount(){const c=app.counts?.[countUi.id];if(!c||!confirm(`Apagar a contagem de ${formatDate(c.date)} (${STORES[c.store]})? Isso não pode ser desfeito.`))return;try{await countRef('counts/'+countUi.id).set(null);delete app.counts[countUi.id];countUi.view='list';renderCounts();showToast('Contagem apagada','');}catch(error){showToast('Não foi possível apagar',firebaseErrorMessage(error),'error');}}
async function deleteCountList(id){const l=app.countLists?.[id];if(!l||!confirm(`Apagar a lista "${l.name}"? As contagens já feitas continuam no histórico.`))return;try{await countRef('countLists/'+id).set(null);delete app.countLists[id];renderCounts();}catch(error){showToast('Não foi possível apagar a lista',firebaseErrorMessage(error),'error');}}
function showCountHistory(encoded){countUi.historyCode=decodeURIComponent(encoded);renderCounts();document.querySelector('.ct-hist')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
function shareCountWhatsApp(){const c=app.counts?.[countUi.id];if(!c)return;const diffs=countItems(c).filter(i=>{const d=countDiff(i);return d!=null&&Math.abs(d)>(i.unit==='un'?0:.005);});
  const text=`*Contagem ${STORES[c.store]} · ${formatDate(c.date)}*\nResponsável: ${c.responsible}\n${diffs.length?diffs.map(i=>{const d=countDiff(i);return`• ${i.name}: sistema ${unitQty(i.system,i.unit)} · contado ${unitQty(i.counted,i.unit)} (${d>0?'+':'−'}${unitQty(Math.abs(d),i.unit)} ${i.unit})`;}).join('\n'):'Sem diferenças ✓'}`;
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');}
