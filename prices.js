/* Produtos e preços v3 (23/11/2026): painel gerencial.
   Indicadores clicáveis no topo (filtram a tabela), tabela compacta com preço e margem por loja,
   resultado do período, e painel do produto com detalhe por loja, preço para a margem-alvo e perdas do extrato. */
let priceDiagnostic='all';
const PRICE_FILTERS={all:'Todos',negative:'Abaixo do custo',low:'Margem abaixo da meta',price:'Preço diferente entre lojas',cost:'Custo diferente entre lojas',missing:'Sem custo ou preço',equal:'Tudo certo'};
function priceTarget(){const t=Number(app.settings?.targetMargin);return t>0&&t<1?t:.30;}
function priceMarkup(cost,price){return cost>0&&price>0?(price-cost)/cost:null;}
function priceDiagnosticMatch(r,key){const ms=[r.m1,r.m2,r.m3].filter(Number.isFinite);return key==='cost'?!r.costEqual&&!r.missingCost:key==='price'?!r.priceEqual&&!r.missingPrice:key==='equal'?!r.different&&ms.every(m=>m>=priceTarget()):key==='missing'?r.missingCost||r.missingPrice:key==='low'?ms.some(m=>m>=0&&m<priceTarget()):key==='negative'?ms.some(m=>m<0):true;}
function setPriceDiagnostic(key){priceDiagnostic=priceDiagnostic===key&&key!=='all'?'all':key;renderPrices();}
function priceStoreStats(r){
  let revenue=0,gross=0,sales=0,belowCost=0;const per=STORE_IDS.map((s,i)=>{const c=r['c'+(i+1)],p=r['p'+(i+1)],q=Math.max(0,num(r.product['venda_periodo_'+s])),stock=num(r.product['estoque_atual_'+s]);const ok=c>0&&p>0,rev=ok?q*p:0,gr=ok?q*(p-c):0;revenue+=rev;gross+=gr;sales+=q;if(ok&&p<c)belowCost+=q*(c-p);return{store:s,c,p,q,stock,rev,gr,margin:priceMargin(c,p),markup:priceMarkup(c,p)};});
  return{per,revenue,gross,sales,belowCost,margin:revenue>0?gross/revenue:null};
}
function priceMarginBar(m){if(!Number.isFinite(m))return'<span class="money-zero">—</span>';const t=priceTarget(),cls=m<0?'bad':m<t?'low':'good',w=Math.max(4,Math.min(100,Math.abs(m)*100/.6));return`<span class="pr3-m ${cls}" title="Margem bruta ${fmtPct(m)} · meta ${fmtPct(t)}"><i style="width:${w}%"></i><b>${fmtPct(m)}</b></span>`;}
function priceSortValue(r,key){const st=r.stats;return key==='name'?r.product.produto:key==='family'?r.product.familia:key==='margin'?st.margin??-9:key==='gross'?st.gross:key==='revenue'?st.revenue:key==='sales'?st.sales:key==='spread'?r.spread:key.startsWith('p')?r[key]:key.startsWith('m')?r[key]??-9:0;}
function renderPrices(){
  const query=norm(document.getElementById('priceSearch').value),hidden=hiddenProductCodes(),target=priceTarget();
  const base=app.products.map(p=>{const r=buildPriceRow(p);r.stats=priceStoreStats(r);const ps=[r.p1,r.p2,r.p3].filter(v=>v>0);r.spread=ps.length>1?Math.max(...ps)-Math.min(...ps):0;return r;}).filter(r=>(!query||norm(r.product.produto+' '+r.product.codigo_produto).includes(query))&&(!selectedPriceFamilies.size||selectedPriceFamilies.has(r.product.familia))&&(priceViewMode==='hidden'?hidden.has(String(r.product.codigo_produto)):!hidden.has(String(r.product.codigo_produto)))&&(priceViewMode!=='different'||r.different));
  const rows=base.filter(r=>priceDiagnosticMatch(r,priceDiagnostic));
  const tot=base.reduce((a,r)=>{a.rev+=r.stats.revenue;a.gross+=r.stats.gross;a.below+=r.stats.belowCost;return a;},{rev:0,gross:0,below:0}),count=k=>base.filter(r=>priceDiagnosticMatch(r,k)).length;
  const lowGap=base.reduce((a,r)=>a+r.stats.per.reduce((b,s)=>b+(s.c>0&&s.p>0&&s.margin<target?s.q*(s.c/(1-target)-s.p):0),0),0);
  const tile=(key,label,value,sub,kind='')=>`<button type="button" class="op3-kpi pr3-tile ${kind}${priceDiagnostic===key?' on':''}" aria-pressed="${priceDiagnostic===key}" onclick="setPriceDiagnostic('${key}')"><span class="op3-kl">${label}</span><strong>${value}</strong><span class="op3-ks">${sub}</span></button>`;
  document.getElementById('priceKpis').innerHTML=`<div class="op3-kpis pr3-kpis">
    ${tile('all','Margem bruta ponderada',tot.rev>0?fmtPct(tot.gross/tot.rev):'—',`resultado ${fmtMoney(tot.gross)} · receita ${fmtMoney(tot.rev)}`)}
    ${tile('negative','Abaixo do custo',count('negative'),tot.below?`perda de ${fmtMoney(tot.below)} no período`:'nenhum item',count('negative')?'alert':'')}
    ${tile('low',`Margem abaixo de ${fmtPct(target)}`,count('low'),lowGap>0?`${fmtMoney(lowGap)} para chegar na meta`:'todos na meta',count('low')?'warn':'')}
    ${tile('price','Preço diferente',count('price'),'entre as lojas')}
    ${tile('cost','Custo diferente',count('cost'),'entre as lojas')}
    ${tile('missing','Sem custo ou preço',count('missing'),'fora das contas')}
  </div><div class="pr3-bar"><span class="op3-muted">${priceDiagnostic!=='all'?`Filtro: <b>${esc(PRICE_FILTERS[priceDiagnostic])}</b> · <button type="button" class="op3-link" onclick="setPriceDiagnostic('all')">limpar</button>`:`${rows.length} produtos`}</span><label class="pr3-target">Meta de margem bruta <input id="priceTargetInput" type="number" min="5" max="80" step="1" value="${Math.round(target*100)}"> %</label></div>`;
  document.getElementById('priceTargetInput').onchange=e=>{const v=Number(e.target.value)/100;if(!(v>0&&v<.9))return;app.settings.targetMargin=v;saveState();renderPrices();queueCentralSave('price_target');};
  document.getElementById('priceCountLabel').textContent=`${rows.length} de ${base.length} produtos`;
  rows.sort((a,b)=>{const x=priceSortValue(a,priceSort.key),y=priceSortValue(b,priceSort.key);return priceSort.dir*(typeof x==='string'?x.localeCompare(y,'pt-BR'):(x??-Infinity)-(y??-Infinity));});
  const arrow=k=>priceSort.key===k?(priceSort.dir>0?' ↑':' ↓'):'';const th=(label,key,cls='num',extra='')=>`<th class="${cls} sortable" ${extra} onclick="sortPrices('${key}')" aria-sort="${priceSort.key===key?(priceSort.dir>0?'ascending':'descending'):'none'}">${label}${arrow(key)}</th>`;
  document.getElementById('priceHead').innerHTML=`<tr>${th('Produto','name','pr3-name')}<th class="num">Custo</th>${STORE_IDS.map((s,i)=>th(esc(STORES[s]),'p'+(i+1),'num store-c'+(i+1),'title="Preço de venda"')).join('')}${STORE_IDS.map((s,i)=>th('Margem '+({'001':'Cor.','002':'Crr.','003':'Bin.'}[s]||esc(STORES[s])),'m'+(i+1),'num store-c'+(i+1))).join('')}${th('Vendido','sales')}${th('Resultado','gross')}<th>Situação</th><th></th></tr>`;
  document.getElementById('priceBody').innerHTML=rows.length?rows.map(r=>{const cs=[r.c1,r.c2,r.c3].filter(v=>v>0),cost=!cs.length?'<span class="money-zero">—</span>':r.costEqual?fmtCurrency(cs[0]):`<span class="money-diff" title="${STORE_IDS.map((s,i)=>STORES[s]+': '+fmtCurrency(r['c'+(i+1)])).join(' · ')}">${fmtCurrency(Math.min(...cs))}–${fmtCurrency(Math.max(...cs)).replace('R$','').trim()}</span>`;
    return`<tr class="pr3-row" onclick="openPriceProduct('${encodeURIComponent(r.product.codigo_produto)}')"><td class="pr3-name"><b>${esc(r.product.produto)}</b><small>${esc(r.product.codigo_produto)} · ${esc(r.product.familia)}</small></td><td class="num">${cost}</td>${STORE_IDS.map((s,i)=>`<td class="num">${priceCell(r['p'+(i+1)],!r.priceEqual)}</td>`).join('')}${STORE_IDS.map((s,i)=>`<td class="num">${priceMarginBar(r['m'+(i+1)])}</td>`).join('')}<td class="num">${fmtQty(r.stats.sales,0)}</td><td class="num"><b class="${r.stats.gross<0?'pr3-neg':''}">${fmtMoney(r.stats.gross)}</b></td><td>${priceStatusBadge(r)}</td><td onclick="event.stopPropagation()">${visibilityButton(r.product,hidden)}</td></tr>`;}).join(''):`<tr><td colspan="12">${empty('Nenhum produto neste filtro','')}</td></tr>`;
  renderPricePriorities(base);
}
function renderPricePriorities(rows){
  let box=document.getElementById('priceInsights');if(!box){box=document.createElement('div');box.id='priceInsights';document.querySelector('#page-prices .tablewrap').after(box);}
  const target=priceTarget(),list=[];
  for(const r of rows){const cs=[r.c1,r.c2,r.c3].filter(c=>c>0),minCost=cs.length?Math.min(...cs):0;for(const s of r.stats.per){if(!(s.c>0&&s.p>0))continue;
    if(s.p<s.c&&s.q>0)list.push({r,s,type:'Venda abaixo do custo',detail:`${fmtCurrency(s.c-s.p)} por item`,value:s.q*(s.c-s.p),level:'critical'});
    else if(s.margin<target&&s.q>0)list.push({r,s,type:`Margem ${fmtPct(s.margin)} (meta ${fmtPct(target)})`,detail:`preço sugerido ${fmtCurrency(s.c/(1-target))}`,value:s.q*(s.c/(1-target)-s.p),level:'warning'});
    if(minCost>0&&s.c>minCost+.01&&s.q>0)list.push({r,s,type:'Custo acima da loja mais barata',detail:`${fmtCurrency(s.c-minCost)} por item`,value:s.q*(s.c-minCost),level:'info'});}}
  list.sort((a,b)=>b.value-a.value);
  box.innerHTML=`<div class="card op3-card"><div class="cardhead"><h2>🎯 Prioridades de preço</h2><span>impacto estimado no período · maiores primeiro</span></div><div class="cardbody">${list.length?`<div class="tablewrap op3-tw"><table class="op3-tbl"><thead><tr><th>Produto</th><th>Loja</th><th>Ocorrência</th><th>Detalhe</th><th class="num">Impacto</th></tr></thead><tbody>${list.slice(0,15).map(o=>`<tr><td class="op3-name"><button type="button" class="op3-link" onclick="openPriceProduct('${encodeURIComponent(o.r.product.codigo_produto)}')">${esc(o.r.product.produto)}</button></td><td><i class="op3-dot" style="background:${STORE_COLORS[o.s.store]}"></i>${esc(STORES[o.s.store])}</td><td><span class="op3-net ${o.level==='critical'?'down':''}">${esc(o.type)}</span></td><td>${esc(o.detail)}</td><td class="num"><b>${fmtCurrency(o.value)}</b></td></tr>`).join('')}</tbody></table></div>`:'<p class="op3-muted">Nenhuma ocorrência nos produtos filtrados. 👍</p>'}</div></div>`;
}
function openPriceProduct(encoded){
  const code=decodeURIComponent(encoded),product=app.products.find(p=>String(p.codigo_produto)===code);if(!product)return;
  const r=buildPriceRow(product),st=priceStoreStats(r),target=priceTarget(),unit=productUnit(product)||'';
  const ops=(app.operations||[]).filter(o=>o.productCode===code),last=ops.map(o=>o.date).sort().pop()||'',month=last.slice(0,7),opsMonth=ops.filter(o=>o.date.startsWith(month));
  const sum=f=>opsMonth.filter(f).reduce((a,o)=>a+Math.abs(o.movementValue),0),loss=sum(o=>o.category==='loss'),invOut=sum(o=>o.operationCode==='000094'),invIn=sum(o=>o.operationCode==='000097');
  const modal=document.getElementById('op3Modal');
  modal.querySelector('.modal').innerHTML=`<div class="modalhead"><h2>${esc(product.produto)}</h2><span class="op3-muted">${esc(code)} · ${esc(product.familia)}${unit?' · '+esc(unit):''}</span></div><div class="modalbody">
  <div class="op3-kpis pr3-mini">${opKpi('Margem bruta',st.margin!=null?fmtPct(st.margin):'—',`meta ${fmtPct(target)}`)}${opKpi('Resultado no período',fmtMoney(st.gross),`receita ${fmtMoney(st.revenue)}`)}${opKpi('Vendido',fmtQty(st.sales,0),'3 lojas')}${month?opKpi(`Perdas ${opMonthName(month)}`,fmtMoney(loss),`inventário: falta ${fmtMoney(invOut)} · sobra ${fmtMoney(invIn)}`):''}</div>
  <div class="tablewrap op3-tw"><table class="op3-tbl"><thead><tr><th>Loja</th><th class="num">Custo</th><th class="num">Preço</th><th class="num">Lucro/item</th><th class="num">Margem</th><th class="num">Markup</th><th class="num" title="Preço para atingir a meta de margem">Preço p/ meta</th><th class="num">Vendido</th><th class="num">Resultado</th><th class="num">Estoque</th></tr></thead><tbody>${st.per.map(s=>`<tr><td><i class="op3-dot" style="background:${STORE_COLORS[s.store]}"></i>${esc(STORES[s.store])}</td><td class="num">${s.c>0?fmtCurrency(s.c):'—'}</td><td class="num">${s.p>0?fmtCurrency(s.p):'—'}</td><td class="num">${s.c>0&&s.p>0?fmtCurrency(s.p-s.c):'—'}</td><td class="num">${priceMarginBar(s.margin)}</td><td class="num">${s.markup!=null?fmtPct(s.markup):'—'}</td><td class="num">${s.c>0?`<b class="${s.p>0&&s.p<s.c/(1-target)?'pr3-neg':''}">${fmtCurrency(s.c/(1-target))}</b>`:'—'}</td><td class="num">${fmtQty(s.q,0)}</td><td class="num">${fmtMoney(s.gr)}</td><td class="num">${fmtQty(s.stock,1)}</td></tr>`).join('')}</tbody></table></div>
  ${ops.length?`<p><button type="button" class="btn sm" onclick="document.getElementById('op3Modal').classList.remove('open');op3.query='${esc(code)}';document.getElementById('op3Search').value='${esc(code)}';navigate('operations');setTimeout(()=>opOpenProduct('${encodeURIComponent(code)}'),50)">Ver movimentações do extrato →</button></p>`:'<p class="op3-muted">Sem movimentações deste produto nos extratos importados.</p>'}</div>
  <div class="modalfoot"><button class="btn" type="button" onclick="document.getElementById('op3Modal').classList.remove('open')">Fechar</button></div>`;
  modal.classList.add('open');
}
