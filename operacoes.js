/* Aba Operações v3 (23/11/2026) — painel gerencial de perdas, limpeza e acertos de inventário.
   Dados: app.operations (expandido por store.js a partir de compras_gerencial_v3/operations). */
const OP_LOSS_KIND={'000058':'Limpeza','000108':'Limpeza','000109':'Limpeza','000110':'Limpeza','000113':'Sangue/líquido','000126':'Sangue/líquido','000125':'Estragado/vencido','000044':'Estragado/vencido','000096':'Perda na loja'};
const OP_INV_IN='000097',OP_INV_OUT='000094';
const OP_PERIODS={month:'Mês do último extrato',prev:'Mês anterior',d30:'Últimos 30 dias',all:'Tudo',custom:'Escolher datas'};
let op3={period:'month',start:'',end:'',store:'all',query:'',evo:'week',metric:'loss',lossKind:'all',lossLimit:12,invLimit:12,product:''};
const OP_KINDS=['Limpeza','Sangue/líquido','Estragado/vencido','Perda na loja'];
const opKindOf=r=>OP_LOSS_KIND[r.operationCode]||'Perda na loja';

/* utilitários usados também por outros módulos */
function pcpMonday(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function pcpQty(n,unit){if(unit==='unknown')return fmtQty(n,0);return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:unit==='kg'?3:0,maximumFractionDigits:unit==='kg'?3:0}).format(num(n))+(unit==='kg'?' kg':' un');}
const opDay=(date,offset)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
const opDaysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5)+1;
const opMonthName=m=>['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(m.slice(5,7))-1]+'/'+m.slice(2,4);
const opShort=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'—';

/* ---------- período ---------- */
function opBounds(){const dates=app.operations.map(r=>r.date).sort();return{min:dates[0]||'',max:dates[dates.length-1]||''};}
function opRange(){
  const{min,max}=opBounds();if(!max)return{start:'',end:''};
  if(op3.period==='custom'&&op3.start&&op3.end)return{start:op3.start,end:op3.end};
  if(op3.period==='all')return{start:min,end:max};
  if(op3.period==='d30')return{start:opDay(max,-29),end:max};
  const month=max.slice(0,7);
  if(op3.period==='prev'){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const m=d.toISOString().slice(0,7);return{start:m+'-01',end:opDay(month+'-01',-1)};}
  return{start:month+'-01',end:max};
}
function opPrevRange(r){if(!r.start)return r;const len=opDaysBetween(r.start,r.end);return{start:opDay(r.start,-len),end:opDay(r.start,-1)};}
function opRows(range,{allStores=false,ignoreQuery=false}={}){
  const q=ignoreQuery?'':norm(op3.query);
  return app.operations.filter(r=>r.date>=range.start&&r.date<=range.end&&(allStores||op3.store==='all'||r.store===op3.store)&&(!q||norm(r.productName+' '+r.productCode).includes(q)));
}

/* ---------- agregações ---------- */
function opTotals(rows){
  const t={sale:0,entry:0,loss:0,invIn:0,invOut:0,transferIn:0,transferOut:0,production:0,clean:0,blood:0,spoil:0,lossQty:{kg:0,un:0},kindQty:{}};
  for(const r of rows){const v=Math.abs(r.movementValue);
    if(r.category==='sale')t.sale+=v;else if(r.category==='entry'&&!/devolu/i.test(r.operation))t.entry+=v;
    else if(r.category==='loss'){t.loss+=v;const k=opKindOf(r);if(k==='Limpeza')t.clean+=v;else if(k==='Sangue/líquido')t.blood+=v;else t.spoil+=v;const kq=t.kindQty[k]||(t.kindQty[k]={kg:0,un:0});kq[operationMeasureUnit(r)==='un'?'un':'kg']+=Math.abs(r.quantity);const u=operationMeasureUnit(r);if(u==='kg')t.lossQty.kg+=Math.abs(r.quantity);else t.lossQty.un+=Math.abs(r.quantity);}
    else if(r.operationCode===OP_INV_IN)t.invIn+=v;else if(r.operationCode===OP_INV_OUT)t.invOut+=v;
    else if(r.operationCode==='000134')t.transferIn+=v;else if(r.operationCode==='000135')t.transferOut+=v;
    else if(r.category==='production')t.production+=v;}
  t.invNet=t.invIn-t.invOut;t.lossPct=t.sale>0?t.loss/t.sale:null;return t;
}
function opByProduct(rows){
  const map=new Map();
  for(const r of rows){const k=r.productCode;let p=map.get(k);if(!p){p={code:k,name:r.productName,rows:[],kinds:{},kindQ:{},kindStores:{},sale:{q:0,v:0},loss:{q:0,v:0},invIn:{q:0,v:0},invOut:{q:0,v:0},prod:0,stores:{},weeks:new Set(),invWeeks:new Set()};map.set(k,p);}
    p.rows.push(r);const q=Math.abs(r.quantity),v=Math.abs(r.movementValue),s=p.stores[r.store]||(p.stores[r.store]={loss:0,invIn:0,invOut:0});
    if(r.category==='sale'){p.sale.q+=q;p.sale.v+=v;}
    else if(r.category==='loss'){p.loss.q+=q;p.loss.v+=v;s.loss+=v;const kind=opKindOf(r);p.kinds[kind]=(p.kinds[kind]||0)+v;p.kindQ[kind]=(p.kindQ[kind]||0)+q;const ks=p.kindStores[kind]||(p.kindStores[kind]={});ks[r.store]=(ks[r.store]||0)+v;p.weeks.add(pcpMonday(r.date));}
    else if(r.operationCode===OP_INV_IN){p.invIn.q+=q;p.invIn.v+=v;s.invIn+=v;p.invWeeks.add(pcpMonday(r.date));}
    else if(r.operationCode===OP_INV_OUT){p.invOut.q+=q;p.invOut.v+=v;s.invOut+=v;p.invWeeks.add(pcpMonday(r.date));}
    else if(r.category==='production')p.prod+=v;}
  for(const p of map.values()){p.unit=operationMeasureUnit(p.rows[0]);p.invNet=p.invIn.v-p.invOut.v;p.lossShare=p.sale.q>0?p.loss.q/p.sale.q:null;}
  return[...map.values()];
}

/* ---------- pontos de atenção ---------- */
function opInsights(rows,products,range){
  const out=[],money=v=>fmtMoney(v);
  const imports=(app.operationsMeta?.imports||[]).filter(i=>i.end>=range.start&&i.start<=range.end);
  for(const i of imports.filter(i=>i.checkOk===false))out.push({level:'critical',icon:'⚠️',title:`Extrato de ${STORES[i.store]} não fechou com o resumo do PDF`,text:`${opShort(i.start)} a ${opShort(i.end)} · reimporte o PDF ou confira o relatório.`});
  for(const s of STORE_IDS){if(op3.store!=='all'&&op3.store!==s)continue;const dates=new Set(rows.filter(r=>r.store===s).map(r=>r.date));if(!dates.size&&app.operations.some(r=>r.store===s))out.push({level:'warning',icon:'📄',title:`${STORES[s]} sem movimentação no período`,text:'Falta importar o extrato desta loja para estas datas.'});}
  const comp=products.filter(p=>p.loss.v>=50&&p.invIn.v>=50).sort((a,b)=>Math.min(b.loss.v,b.invIn.v)-Math.min(a.loss.v,a.invIn.v)).slice(0,4);
  for(const p of comp)out.push({level:'critical',icon:'🔁',code:p.code,title:`${p.name}: inventário devolvendo o que saiu como perda`,text:`${OP_KINDS.filter(k=>p.kinds[k]).map(k=>k+' '+money(p.kinds[k])).join(' · ')} e entrada no inventário ${money(p.invIn.v)}. Algum desses lançamentos pode estar a mais.`});
  const prodCodes=new Set(rows.filter(r=>['000042','000138','000058','000083','000131'].includes(r.operationCode)).map(r=>r.productCode));
  for(const p of products.filter(p=>p.invOut.v>=300).sort((a,b)=>b.invOut.v-a.invOut.v).slice(0,4))out.push({level:p.invOut.v>=1000?'critical':'warning',icon:'📉',code:p.code,title:`${p.name}: falta de ${money(p.invOut.v)} no inventário`,text:prodCodes.has(p.code)||/hamb|burger|blend/i.test(p.name)?'Item usado na produção: confira se toda produção foi baixada no sistema.':`Saída de ${pcpQty(p.invOut.q,p.unit)} sem venda ou perda registrada.`});
  for(const p of products.filter(p=>p.lossShare!=null&&p.lossShare>=.08&&p.lossShare<=1&&p.loss.v>=80).sort((a,b)=>b.lossShare-a.lossShare).slice(0,3))out.push({level:'warning',icon:'🧹',code:p.code,title:`${p.name}: perda de ${fmtPct(p.lossShare)} do que foi vendido`,text:`${pcpQty(p.loss.q,p.unit)} de perda/limpeza para ${pcpQty(p.sale.q,p.unit)} vendidos.`});
  for(const p of products.filter(p=>p.invWeeks.size>=3).sort((a,b)=>b.invWeeks.size-a.invWeeks.size).slice(0,3))out.push({level:'warning',icon:'⚖️',code:p.code,title:`${p.name}: acerto de inventário em ${p.invWeeks.size} semanas`,text:'Acerto toda semana indica erro de processo (pesagem, cadastro ou baixa), não diferença pontual.'});
  const odd=products.filter(p=>p.unit==='un'&&p.rows.some(r=>r.category!=='sale'&&Math.abs(r.quantity%1)>.001)).slice(0,3);
  for(const p of odd)out.push({level:'info',icon:'🏷️',code:p.code,title:`${p.name}: quantidade quebrada em item por unidade`,text:'Confira a unidade do cadastro (un, kg ou caixa).'});
  const derived=rows.filter(r=>r.qtyDerived).length;if(derived)out.push({level:'info',icon:'ℹ️',title:`${derived} movimentações com quantidade calculada`,text:'O PDF não trazia a quantidade legível; foi calculada por valor ÷ preço.'});
  const order={critical:0,warning:1,info:2};return out.sort((a,b)=>order[a.level]-order[b.level]);
}

/* ---------- gráfico de evolução (barras empilhadas por loja) ---------- */
const OP_METRICS={loss:'Todas as perdas',clean:'Limpeza',blood:'Sangue/líquido',spoil:'Estragado/perda',invOut:'Falta no inventário',invIn:'Sobra no inventário',invNet:'Saldo do inventário'};
function opEvolution(range){
  const all=opRows({start:'0000',end:'9999'},{ignoreQuery:false}),keyOf=d=>op3.evo==='month'?d.slice(0,7):pcpMonday(d);
  let rows=all;if(op3.evo==='week'){const from=opDay(pcpMonday(range.end),-7*11);rows=all.filter(r=>r.date>=from&&r.date<=range.end);}
  const buckets=new Map();
  for(const r of rows){const k=keyOf(r.date);let b=buckets.get(k);if(!b){b={key:k,stores:{}};buckets.set(k,b);}const s=b.stores[r.store]||(b.stores[r.store]=[]);s.push(r);}
  return[...buckets.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(b=>{const vals={},sale={};let total=0,saleT=0;for(const s of STORE_IDS){const t=opTotals(b.stores[s]||[]);vals[s]=t[op3.metric];sale[s]=t.sale;total+=t[op3.metric];saleT+=t.sale;}return{key:b.key,label:op3.evo==='month'?opMonthName(b.key):opShort(b.key),vals,total,pct:['loss','clean','blood','spoil'].includes(op3.metric)&&saleT>0?total/saleT:null,saleT};});
}
function opChart(series){
  if(!series.length)return empty('Sem dados para o gráfico','Importe um extrato para ver a evolução.');
  const box=document.getElementById('op3Body')?.clientWidth||760,narrow=box<620;if(narrow&&series.length>6)series=series.slice(-6);const W=narrow?380:760,H=narrow?250:230,padL=narrow?44:58,padR=10,padT=22,padB=34,stores=op3.store==='all'?STORE_IDS:[op3.store];
  const pos=series.map(s=>stores.reduce((a,st)=>a+Math.max(0,s.vals[st]),0)),neg=series.map(s=>stores.reduce((a,st)=>a+Math.min(0,s.vals[st]),0));
  const max=Math.max(1,...pos),min=Math.min(0,...neg),y=v=>padT+(max-v)/(max-min)*(H-padT-padB),bw=Math.min(46,(W-padL-padR)/series.length*.62),step=(W-padL-padR)/series.length;
  const ticks=[0,max/2,max].concat(min<0?[min]:[]);let svg=`<svg class="op3-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(OP_METRICS[op3.metric])} por ${op3.evo==='month'?'mês':'semana'}">`;
  for(const t of ticks)svg+=`<line x1="${padL}" x2="${W-padR}" y1="${y(t)}" y2="${y(t)}" class="${t===0?'op3-base':'op3-grid'}"/><text x="${padL-8}" y="${y(t)+4}" class="op3-axis" text-anchor="end">${fmtMoney(t).replace('R$','').trim()}</text>`;
  series.forEach((s,i)=>{const x=padL+step*i+(step-bw)/2;let up=0,down=0;
    for(const st of stores){const v=s.vals[st];if(!v)continue;const from=v>0?up:down,to=from+v;const y1=y(Math.max(from,to)),h=Math.max(1,Math.abs(y(from)-y(to))-2);svg+=`<rect x="${x}" y="${y1+(v>0?2:0)}" width="${bw}" height="${h}" rx="3" fill="${STORE_COLORS[st]}" data-tip="${esc(s.label+' · '+STORES[st]+': '+fmtCurrency(v))}"/>`;if(v>0)up=to;else down=to;}
    svg+=`<text x="${x+bw/2}" y="${y(Math.max(up,0))-6}" class="op3-val" text-anchor="middle">${fmtMoney(s.total).replace('R$','').trim()}</text><text x="${x+bw/2}" y="${H-padB+16}" class="op3-axis" text-anchor="middle">${esc(s.label)}</text>`;
    if(s.pct!=null)svg+=`<text x="${x+bw/2}" y="${H-padB+29}" class="op3-pct" text-anchor="middle">${fmtPct(s.pct)}</text>`;
    svg+=`<rect x="${padL+step*i}" y="${padT}" width="${step}" height="${H-padT-padB}" fill="transparent" class="op3-hit" data-tip="${esc(s.label+' · total '+fmtCurrency(s.total)+(s.pct!=null?' · '+fmtPct(s.pct)+' das vendas':'')+'\n'+stores.map(st=>STORES[st]+': '+fmtCurrency(s.vals[st])).join('\n'))}"/>`;});
  svg+='</svg>';
  const legend=stores.length>1?`<div class="op3-legend">${stores.map(s=>`<span><i style="background:${STORE_COLORS[s]}"></i>${esc(STORES[s])}</span>`).join('')}${['loss','clean','blood','spoil'].includes(op3.metric)?'<span class="op3-muted">% = sobre as vendas</span>':''}</div>`:'';
  const table=`<details class="op3-table"><summary>Ver números em tabela</summary><div class="tablewrap"><table><thead><tr><th>${op3.evo==='month'?'Mês':'Semana de'}</th>${stores.map(s=>`<th class="num">${esc(STORES[s])}</th>`).join('')}<th class="num">Total</th>${['loss','clean','blood','spoil'].includes(op3.metric)?'<th class="num">% vendas</th>':''}</tr></thead><tbody>${series.map(s=>`<tr><td>${esc(s.label)}</td>${stores.map(st=>`<td class="num">${fmtCurrency(s.vals[st])}</td>`).join('')}<td class="num"><b>${fmtCurrency(s.total)}</b></td>${['loss','clean','blood','spoil'].includes(op3.metric)?`<td class="num">${fmtPct(s.pct)}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`;
  return legend+`<div class="op3-chartwrap">${svg}</div>`+table;
}

/* ---------- tabelas ---------- */
function opStoreCells(p,key){return STORE_IDS.map(s=>`<td class="num store-c${STORE_IDS.indexOf(s)+1}">${p.stores[s]?.[key]?fmtMoney(p.stores[s][key]):'—'}</td>`).join('');}
function opProductBtn(p){return`<td class="op3-name"><button type="button" class="op3-link" onclick="opOpenProduct('${encodeURIComponent(p.code)}')">${esc(p.name)}</button><small>${esc(p.code)}</small></td>`;}
function opLossTable(products){
  const kind=op3.lossKind,val=p=>kind==='all'?p.loss.v:(p.kinds[kind]||0),list=products.filter(p=>val(p)>0).sort((a,b)=>val(b)-val(a));
  const chips=`<div class="pk-row op3-inline op3-kinds">${[['all','Todos os tipos'],...OP_KINDS.map(k=>[k,k])].map(([k,l])=>`<button type="button" class="pk-chip${kind===k?' on':''}" aria-pressed="${kind===k}" onclick="op3.lossKind='${k}';op3.lossLimit=12;renderOperations()">${l}</button>`).join('')}</div>`;
  if(!list.length)return chips+empty('Nenhuma perda deste tipo no período','');
  const cell=(p,k)=>p.kinds[k]?`<td class="num${kind===k?' op3-kcol':''}">${pcpQty(p.kindQ[k],p.unit)}<small>${fmtMoney(p.kinds[k])}</small></td>`:`<td class="num op3-muted${kind===k?' op3-kcol':''}">—</td>`;
  const share=p=>{const q=kind==='all'?p.loss.q:(p.kindQ[kind]||0),x=p.sale.q>0?q/p.sale.q:null;return x==null?'—':x>1?'<span class="op3-muted" title="Perda maior que a venda do próprio código: item vendido como outro produto (ex.: peça que vira cortes)">matéria-prima</span>':fmtPct(x);};
  const storeVal=(p,s)=>kind==='all'?p.stores[s]?.loss:p.kindStores[kind]?.[s];
  const rows=list.slice(0,op3.lossLimit).map((p,i)=>`<tr><td class="num op3-rank">${i+1}</td>${opProductBtn(p)}${OP_KINDS.map(k=>cell(p,k)).join('')}<td class="num"><b>${fmtCurrency(val(p))}</b></td><td class="num">${share(p)}</td>${STORE_IDS.map((s,j)=>`<td class="num store-c${j+1}">${storeVal(p,s)?fmtMoney(storeVal(p,s)):'—'}</td>`).join('')}</tr>`);
  return chips+`<div class="tablewrap op3-tw" tabindex="0" aria-label="Tabela (deslize para ver mais)"><table class="op3-tbl"><thead><tr><th class="num op3-rank">#</th><th>Produto</th>${OP_KINDS.map(k=>`<th class="num${kind===k?' op3-kcol':''}">${k}</th>`).join('')}<th class="num">${kind==='all'?'Total':esc(kind)}</th><th class="num" title="Quantidade perdida ÷ quantidade vendida do item">% da venda</th>${STORE_IDS.map((s,i)=>`<th class="num store-c${i+1}">${esc(STORES[s])}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${list.length>op3.lossLimit?`<button class="btn sm op3-more" type="button" onclick="op3.lossLimit+=20;renderOperations()">Ver mais ${Math.min(20,list.length-op3.lossLimit)} de ${list.length}</button>`:''}`;
}
function opInvTable(products){
  const list=products.filter(p=>p.invIn.v||p.invOut.v).sort((a,b)=>Math.abs(b.invIn.v)+Math.abs(b.invOut.v)-Math.abs(a.invIn.v)-Math.abs(a.invOut.v));if(!list.length)return empty('Nenhum acerto de inventário no período','');
  const net=v=>`<span class="op3-net ${v>0?'up':v<0?'down':''}">${v>0?'▲ sobra ':v<0?'▼ falta ':''}${fmtCurrency(Math.abs(v))}</span>`;
  const rows=list.slice(0,op3.invLimit).map((p,i)=>`<tr><td class="num op3-rank">${i+1}</td>${opProductBtn(p)}<td class="num">${p.invIn.q?pcpQty(p.invIn.q,p.unit):'—'}<small>${p.invIn.v?fmtMoney(p.invIn.v):''}</small></td><td class="num">${p.invOut.q?pcpQty(p.invOut.q,p.unit):'—'}<small>${p.invOut.v?fmtMoney(p.invOut.v):''}</small></td><td class="num">${net(p.invNet)}</td><td class="num">${p.invWeeks.size}</td><td>${STORE_IDS.filter(s=>p.stores[s]?.invIn||p.stores[s]?.invOut).map(s=>STORES[s]).join(', ')}</td></tr>`);
  return`<div class="tablewrap op3-tw" tabindex="0" aria-label="Tabela (deslize para ver mais)"><table class="op3-tbl"><thead><tr><th class="num op3-rank">#</th><th>Produto</th><th class="num">Entrada (sobra)</th><th class="num">Saída (falta)</th><th class="num">Saldo</th><th class="num" title="Semanas com acerto">Semanas</th><th>Lojas</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${list.length>op3.invLimit?`<button class="btn sm op3-more" type="button" onclick="op3.invLimit+=20;renderOperations()">Ver mais ${Math.min(20,list.length-op3.invLimit)} de ${list.length}</button>`:''}`;
}
function opStoreTable(rows){
  const cols=[['Vendas','sale'],['Compras','entry'],['Perdas e limpeza','loss'],['% perda','lossPct'],['Inv. saída','invOut'],['Inv. entrada','invIn'],['Saldo inv.','invNet'],['Transf. saída','transferOut'],['Transf. entrada','transferIn'],['Produção','production']];
  const line=(name,t,cls='')=>`<tr class="${cls}"><td class="op3-name">${name}</td>${cols.map(([,k])=>`<td class="num">${k==='lossPct'?fmtPct(t[k]):k==='invNet'?`<span class="op3-net ${t[k]>0?'up':t[k]<0?'down':''}">${fmtMoney(t[k])}</span>`:fmtMoney(t[k])}</td>`).join('')}</tr>`;
  return`<div class="tablewrap op3-tw" tabindex="0" aria-label="Tabela (deslize para ver mais)"><table class="op3-tbl"><thead><tr><th>Loja</th>${cols.map(([l])=>`<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${STORE_IDS.map(s=>line(`<i class="op3-dot" style="background:${STORE_COLORS[s]}"></i>${esc(STORES[s])}`,opTotals(rows.filter(r=>r.store===s)))).join('')}${line('<b>Total</b>',opTotals(rows),'op3-total')}</tbody></table></div>`;
}

/* ---------- render principal ---------- */
function opKpi(label,value,sub,delta,kind=''){return`<div class="op3-kpi ${kind}"><span class="op3-kl">${label}</span><strong>${value}</strong><span class="op3-ks">${sub}</span>${delta||''}</div>`;}
function opDelta(cur,prev,goodWhenDown=true){if(!prev)return'';const d=(cur-prev)/Math.abs(prev);if(!Number.isFinite(d))return'';const bad=goodWhenDown?d>0:d<0;return`<span class="op3-delta ${Math.abs(d)<.02?'':bad?'bad':'good'}">${d>0?'▲':'▼'} ${fmtPct(Math.abs(d))} vs período anterior</span>`;}
function renderOperations(){
  const page=document.getElementById('page-operations');if(!page)return;
  const imports=app.operationsMeta?.imports||[];
  document.getElementById('operationSourceLabel').textContent=imports.length?`${imports.length} extrato(s) · última importação ${formatImportMoment(app.operationsMeta.importedAt)} · ${app.operationsMeta.importedBy||''}`:'Nenhum extrato importado ainda.';
  document.getElementById('operationCountLabel').textContent=`${app.operations.length.toLocaleString('pt-BR')} movimentações na base`;
  const range=opRange(),body=document.getElementById('op3Body');
  document.getElementById('op3Periods').innerHTML=Object.entries(OP_PERIODS).map(([k,l])=>`<button type="button" class="pk-chip${op3.period===k?' on':''}" aria-pressed="${op3.period===k}" onclick="opSetPeriod('${k}')">${l}</button>`).join('');
  document.getElementById('op3Stores').innerHTML=[['all','Todas'],...STORE_IDS.map(s=>[s,STORES[s]])].map(([k,l])=>`<button type="button" class="pk-chip${op3.store===k?' on':''}" aria-pressed="${op3.store===k}" onclick="opSetStore('${k}')">${k!=='all'?`<i class="op3-dot" style="background:${STORE_COLORS[k]}"></i>`:''}${esc(l)}</button>`).join('');
  const custom=document.getElementById('op3Custom');custom.classList.toggle('hide',op3.period!=='custom');if(range.start){document.getElementById('op3Start').value=range.start;document.getElementById('op3End').value=range.end;}
  document.getElementById('op3RangeLabel').textContent=range.start?`${formatDate(range.start)} a ${formatDate(range.end)} · ${opDaysBetween(range.start,range.end)} dias`:'';
  if(!app.operations.length){body.innerHTML=`<div class="card">${empty('Nenhuma movimentação na base','Importe o "Extrato de Produtos - Com Saldo e Resumo por Operação" do Alterdata (pode ter as 3 lojas no mesmo PDF).')}</div>`;renderOpImports();return;}
  const rows=opRows(range),prev=opRows(opPrevRange(range)),t=opTotals(rows),p=opTotals(prev),products=opByProduct(rows),insights=opInsights(rows,products,range);
  const kq=k=>{const x=t.kindQty[k];return x?[x.kg?fmtQty(x.kg,1)+' kg':'',x.un?formatUnits(x.un)+' un':''].filter(Boolean).join(' · '):'';};
  const kpis=[
    opKpi('Todas as perdas',fmtMoney(t.loss),`${t.lossPct!=null?fmtPct(t.lossPct)+' das vendas':'sem vendas no período'}`,opDelta(t.loss,p.loss),t.lossPct>.015?'alert':''),
    opKpi('🔪 Limpeza',fmtMoney(t.clean),[kq('Limpeza'),t.sale?fmtPct(t.clean/t.sale)+' das vendas':''].filter(Boolean).join(' · ')||'—',opDelta(t.clean,p.clean)),
    opKpi('🩸 Sangue/líquido',fmtMoney(t.blood),[kq('Sangue/líquido'),t.sale?fmtPct(t.blood/t.sale)+' das vendas':''].filter(Boolean).join(' · ')||'—',opDelta(t.blood,p.blood)),
    opKpi('🗑️ Estragado/perda',fmtMoney(t.spoil),[kq('Estragado/vencido'),kq('Perda na loja')].filter(Boolean).join(' · ')||'—',opDelta(t.spoil,p.spoil)),
    opKpi('Falta no inventário',fmtMoney(t.invOut),'saída por ajuste',opDelta(t.invOut,p.invOut)),
    opKpi('Sobra no inventário',fmtMoney(t.invIn),'entrada por ajuste',opDelta(t.invIn,p.invIn)),
    opKpi('Saldo do inventário',`${t.invNet>=0?'+':'−'} ${fmtMoney(Math.abs(t.invNet))}`,`${t.invNet>=0?'sobrou mais do que faltou':'faltou mais do que sobrou'} · vendas ${fmtMoney(t.sale)}`,'',Math.abs(t.invNet)>Math.max(500,t.sale*.005)?'warn':'')
  ].join('');
  const metricChips=Object.entries(OP_METRICS).map(([k,l])=>`<button type="button" class="pk-chip${op3.metric===k?' on':''}" aria-pressed="${op3.metric===k}" onclick="op3.metric='${k}';renderOperations()">${l}</button>`).join('');
  const evoChips=[['week','Semana'],['month','Mês']].map(([k,l])=>`<button type="button" class="pk-chip${op3.evo===k?' on':''}" aria-pressed="${op3.evo===k}" onclick="op3.evo='${k}';renderOperations()">${l}</button>`).join('');
  const insightHtml=insights.length?insights.slice(0,9).map(i=>`<div class="op3-ins ${i.level}"><span class="op3-ins-ic" aria-hidden="true">${i.icon}</span><div><b>${esc(i.title)}</b><small>${esc(i.text)}</small></div>${i.code?`<button type="button" class="op3-link" onclick="opOpenProduct('${encodeURIComponent(i.code)}')">ver →</button>`:''}</div>`).join(''):'<p class="op3-muted">Nada fora do padrão no período. 👍</p>';
  body.innerHTML=`<div class="op3-kpis">${kpis}</div>
  <div class="op3-grid"><div class="card"><div class="cardhead"><h2>Evolução ${op3.evo==='month'?'mês a mês':'semana a semana'}</h2><div class="pk-row op3-inline">${evoChips}</div></div><div class="cardbody"><div class="pk-row op3-inline">${metricChips}</div>${opChart(opEvolution(range))}</div></div>
  <div class="card op3-side"><div class="cardhead"><h2>Pontos de atenção</h2><span>${insights.length} encontrado(s)</span></div><div class="cardbody">${insightHtml}</div></div></div>
  <div class="card op3-card"><div class="cardhead"><h2>🧹 Mercadorias com mais perda</h2><span>limpeza, sangue/líquido e estragado separados · % sobre a venda do próprio item</span></div><div class="cardbody">${opLossTable(products)}</div></div>
  <div class="card op3-card"><div class="cardhead"><h2>⚖️ Maiores acertos de inventário</h2><span>entradas (sobra) e saídas (falta)</span></div><div class="cardbody">${opInvTable(products)}</div></div>
  <div class="card op3-card"><div class="cardhead"><h2>🏪 Resumo por loja</h2><span>${formatDate(range.start)} a ${formatDate(range.end)}</span></div><div class="cardbody">${opStoreTable(opRows(range,{allStores:true}))}</div></div>`;
  renderOpImports();
}
function renderOpImports(){
  const imports=app.operationsMeta?.imports||[],box=document.getElementById('op3Imports');if(!box)return;
  box.innerHTML=imports.length?`<div class="tablewrap op3-tw" tabindex="0" aria-label="Tabela (deslize para ver mais)"><table class="op3-tbl"><thead><tr><th>Loja</th><th>Período</th><th class="num">Movimentações</th><th>Conferência</th><th>Arquivo</th><th>Importado</th><th></th></tr></thead><tbody>${imports.map(i=>`<tr><td><i class="op3-dot" style="background:${STORE_COLORS[i.store]}"></i>${esc(STORES[i.store]||i.store)}</td><td>${formatDate(i.start)} a ${formatDate(i.end)}</td><td class="num">${(i.rows||0).toLocaleString('pt-BR')}</td><td>${i.checkOk===false?'<span class="op3-net down">⚠ não fechou</span>':i.checkOk?'<span class="op3-net up">✓ confere</span>':'—'}</td><td class="op3-file">${esc(i.fileName||'')}</td><td>${esc(formatImportMoment(i.importedAt))}</td><td><button class="btn sm" type="button" onclick="opRemoveImport('${esc(i.id)}')">Remover</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="op3-muted">Nenhum extrato na base.</p>';
}
function opSetPeriod(k){op3.period=k;op3.lossLimit=op3.invLimit=12;if(k==='custom'){const r=opRange();op3.start=op3.start||r.start;op3.end=op3.end||r.end;}renderOperations();}
function opSetStore(k){op3.store=k;renderOperations();}

/* ---------- histórico do produto ---------- */
function opOpenProduct(encoded){
  const code=decodeURIComponent(encoded),range=opRange(),rows=app.operations.filter(r=>r.productCode===code&&r.date>=range.start&&r.date<=range.end&&(op3.store==='all'||r.store===op3.store)).sort((a,b)=>b.date.localeCompare(a.date));
  if(!rows.length)return;const name=rows[0].productName,unit=operationMeasureUnit(rows[0]),groups={};
  for(const r of rows){const g=groups[r.operation]||(groups[r.operation]={cat:r.category,q:0,v:0,n:0});g.q+=Math.abs(r.quantity);g.v+=Math.abs(r.movementValue);g.n++;}
  const modal=document.getElementById('op3Modal');
  modal.querySelector('.modal').innerHTML=`<div class="modalhead"><h2>${esc(name)}</h2><span class="op3-muted">${esc(code)} · ${formatDate(range.start)} a ${formatDate(range.end)}${op3.store!=='all'?' · '+esc(STORES[op3.store]):''}</span></div>
  <div class="modalbody"><div class="op3-sum">${Object.entries(groups).sort((a,b)=>b[1].v-a[1].v).map(([op,g])=>`<div>${operationBadge(g.cat)}<b>${esc(op)}</b><span>${pcpQty(g.q,unit)} · ${fmtCurrency(g.v)} · ${g.n}×</span></div>`).join('')}</div>
  <div class="tablewrap op3-tw" tabindex="0" aria-label="Tabela (deslize para ver mais)"><table class="op3-tbl"><thead><tr><th>Data</th><th>Loja</th><th>Operação</th><th class="num">Quantidade</th><th class="num">Valor</th><th>Documento</th></tr></thead><tbody>${rows.filter(r=>r.category!=='sale').slice(0,300).map(r=>`<tr><td>${opShort(r.date)}</td><td>${esc(STORES[r.store])}</td><td>${esc(r.operation)}</td><td class="num">${pcpQty(r.quantity,unit)}${r.qtyDerived?' *':''}</td><td class="num">${fmtCurrency(r.movementValue)}</td><td>${esc(r.document)}</td></tr>`).join('')}</tbody></table></div><p class="op3-muted">Vendas aparecem só no resumo acima. * quantidade calculada por valor ÷ preço.</p></div>
  <div class="modalfoot"><button class="btn" type="button" onclick="document.getElementById('op3Modal').classList.remove('open')">Fechar</button></div>`;
  modal.classList.add('open');
}

/* ---------- importação ---------- */
async function importOperationsPdf(file){
  if(!file)return;const button=document.getElementById('operationImportButton'),original=button.textContent;button.disabled=true;button.textContent='Lendo extrato…';
  try{
    if(!syncReady)throw new Error('Aguarde a conexão com a base central.');
    const parsed=await readExtratoPdf(file,(n,total)=>{button.textContent=`Lendo PDF ${n}/${total}…`;});
    if(!parsed.rows.length)throw new Error('Nenhuma movimentação encontrada. Confira se é o "Extrato de Produtos - Com Saldo e Resumo por Operação".');
    const c=parsed.check,ok=c.hasSummary?(c.ok?'<b class="op3-net up">✓ Quantidades conferem com o resumo do PDF</b>':`<b class="op3-net down">⚠ Não confere: lido ${fmtQty(c.parsedQty,2)} · resumo ${fmtQty(c.summaryQty,2)}</b>`):'<b>Resumo do PDF não encontrado (sem conferência)</b>';
    document.getElementById('importModalTitle').textContent='Confirmar extrato de operações';
    document.getElementById('importModalLead').textContent='As movimentações de cada loja abaixo substituem as que já existem nas mesmas datas, em todos os computadores.';
    document.getElementById('importConfirm').textContent='Importar extrato';
    document.getElementById('importPreview').innerHTML=`<dl>${Object.entries(parsed.byStore).map(([s,i])=>`<dt><i class="op3-dot" style="background:${STORE_COLORS[s]}"></i>${esc(STORES[s])}</dt><dd>${i.rows.toLocaleString('pt-BR')} mov. · ${formatDate(i.start)} a ${formatDate(i.end)}</dd>`).join('')}<dt>Páginas</dt><dd>${parsed.pages}</dd></dl><p>${ok}</p>${parsed.warnings.length?`<details><summary>${parsed.warnings.length} aviso(s)</summary><ul>${parsed.warnings.slice(0,30).map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:''}`;
    button.textContent='Aguardando confirmação…';
    const confirmed=await new Promise(resolve=>openConfirmModal(resolve));
    if(!confirmed){showToast('Importação cancelada','Nada foi alterado.');return;}
    button.textContent='Salvando na base central…';
    await saveOperationsImport(parsed,file.name);
    showToast('Extrato importado',`${parsed.rows.length.toLocaleString('pt-BR')} movimentações de ${Object.keys(parsed.byStore).map(s=>STORES[s]).join(', ')}. Todos os computadores foram atualizados.`);
  }catch(error){setSyncStatus('Erro na importação','error');showToast('Erro ao importar extrato',firebaseErrorMessage(error),'error');}
  finally{button.disabled=false;button.textContent=original;}
}
function opRemoveImport(id){
  const e=app.operationsMeta?.importsById?.[id];if(!e)return;
  document.getElementById('importModalTitle').textContent='Remover extrato';document.getElementById('importModalLead').textContent=`As movimentações de ${STORES[e.store]} de ${formatDate(e.start)} a ${formatDate(e.end)} saem da base em todos os computadores.`;document.getElementById('importConfirm').textContent='Remover';document.getElementById('importPreview').innerHTML='';
  openConfirmModal(async ok=>{if(!ok)return;try{await removeOperationsImport(id);showToast('Extrato removido','');}catch(error){showToast('Não foi possível remover',firebaseErrorMessage(error),'error');}});
}
/* Catálogo de unidades kg/un (relatório de produtos do Alterdata) */
async function importOperationUnits(file){
  if(!file)return;try{if(!fbDB||!currentUser||!syncReady)throw new Error('Aguarde a conexão com a base central.');let rows;
    if(/\.csv$/i.test(file.name)){const lines=(await file.text()).replace(/^﻿/,'').split(/\r?\n/).filter(Boolean),d=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',',head=parseCsvLine(lines.shift(),d);rows=lines.map(l=>{const v=parseCsvLine(l,d);return Object.fromEntries(head.map((h,i)=>[h,v[i]]));});}
    else{if(typeof XLSX==='undefined')throw new Error('Leitor de planilha indisponível.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});}
    const cols=detectColumns([...new Set(rows.flatMap(Object.keys))]);if(!cols.code||!cols.unit)throw new Error('O relatório precisa das colunas Código do produto e Unidade.');
    const units={};for(const row of rows){const code=cleanProductCode(row[cols.code]),unit=normalizeMeasureUnit(row[cols.unit]);if(code&&unit)units[code]=unit;}
    if(!Object.keys(units).length)throw new Error('Nenhuma unidade kg ou un foi encontrada.');
    await fbDB.ref(CENTRAL_PATH+'/unitCatalog').update(units);showToast('Unidades atualizadas',Object.keys(units).length+' produtos com unidade definida.');
  }catch(error){showToast('Erro ao importar unidades',firebaseErrorMessage(error),'error');}
}
function bindOperations(){
  document.getElementById('operationImportButton').addEventListener('click',()=>document.getElementById('operationFileInput').click());
  document.getElementById('operationFileInput').addEventListener('change',e=>{importOperationsPdf(e.target.files[0]);e.target.value='';});
  document.getElementById('op3Search').addEventListener('input',e=>{op3.query=e.target.value;clearTimeout(op3.t);op3.t=setTimeout(renderOperations,200);});
  for(const id of['op3Start','op3End'])document.getElementById(id).addEventListener('change',()=>{op3.start=document.getElementById('op3Start').value;op3.end=document.getElementById('op3End').value;if(op3.start&&op3.end&&op3.end<op3.start)return showToast('Período inválido','A data final deve ser depois da inicial.','error');renderOperations();});
  document.getElementById('op3Modal').addEventListener('click',e=>{if(e.target.id==='op3Modal')e.currentTarget.classList.remove('open');});
  const tip=document.getElementById('op3Tip');
  document.getElementById('page-operations').addEventListener('mousemove',e=>{const t=e.target.closest?.('[data-tip]');if(!t){tip.classList.remove('on');return;}tip.textContent=t.dataset.tip;tip.classList.add('on');const x=Math.min(e.clientX+14,window.innerWidth-tip.offsetWidth-8);tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px';});
  document.getElementById('page-operations').addEventListener('mouseleave',()=>tip.classList.remove('on'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindOperations);else bindOperations();
