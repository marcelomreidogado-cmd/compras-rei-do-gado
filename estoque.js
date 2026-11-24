/* Estoque por loja v3.1 (23/11/2026)
   - Aba Produtos: só as linhas que movimentam a loja (churrasco, dia a dia, pão de alho...).
   - Aba Complementos: bebidas, molhos e qualquer família que o Marcelo mover para cá (acompanhamentos, sobremesas...).
   - Unidade de cada produto (kg/un): cadastro → nome → família; itens por unidade sempre em número inteiro. */
const SIDE_FAMILIES_DEFAULT=['BEBIDAS','MOLHOS COM SAIDA'];
const STOCK_FILTERS={all:'Todos',rupture:'Ruptura',negative:'Estoque negativo',low:'Cobertura baixa',excess:'Excesso',slow:'Sem giro',transfer:'Pode transferir'};
const STOCK_VIEW={products:{filter:'all',store:'all',sort:{key:'name',dir:1}},extras:{filter:'all',store:'all',sort:{key:'name',dir:1},families:new Set()}};
function sideFamilies(){const list=app.settings?.sideFamilies;return new Set(Array.isArray(list)?list:SIDE_FAMILIES_DEFAULT);}

/* ---------- unidades ---------- */
const UNIT_NAME_UN=/\b\d+\s?(ML|L|LT|LTS|LITROS?|G|GR|GRS)\b|\b(LATA|LONG ?NECK|LONG|GARRAFA|GARRAFINHA|PET|PACOTE|PCT|UNID|UND|UN|CX|CAIXA|SACHE|POTE|VIDRO|KIT|SPRAY)\b/i;
function productMeasureUnit(product){
  if(!product)return'unknown';const code=cleanProductCode(product.codigo_produto||product.productCode||''),name=String(product.produto||product.productName||'');
  const official=normalizeMeasureUnit(app.unitCatalog?.[code])||normalizeMeasureUnit(product.unidade);if(official)return official;
  if(/\bKG\b|\bA GRANEL\b/i.test(name))return'kg';
  if(code==='056001'||/^HB(?:\s|[.\-])/i.test(name)||UNIT_NAME_UN.test(name))return'un';
  if(sideFamilies().has(product.familia)||['BEBIDAS','MOLHOS COM SAIDA','PAO DE ALHO'].includes(product.familia))return'un';
  return'kg';
}
/* Itens por unidade: estoque, venda e compra arredondados (o Alterdata às vezes manda 45,51 un). */
function normalizeUnitQuantities(products){
  for(const p of products||[]){if(productMeasureUnit(p)!=='un')continue;for(const s of STORE_IDS)for(const f of['estoque_atual_','venda_periodo_','compra_periodo_']){const k=f+s;if(typeof p[k]==='number'&&Math.abs(p[k]%1)>1e-9)p[k]=Math.round(p[k]);}}
  return products;
}
function unitQty(value,unit){const n=num(value);return unit==='un'?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Math.round(n)):new Intl.NumberFormat('pt-BR',{maximumFractionDigits:n!==0&&Math.abs(n)<10?2:1}).format(n);}
async function cycleProductUnit(encoded){
  const raw=decodeURIComponent(encoded),product=app.products.find(p=>String(p.codigo_produto)===raw);if(!product)return;const code=cleanProductCode(raw);
  const current=normalizeMeasureUnit(app.unitCatalog?.[code]),next=current==='kg'?'un':current==='un'?null:(productMeasureUnit(product)==='kg'?'un':'kg');
  try{await fbDB.ref(CENTRAL_PATH+'/unitCatalog/'+code).set(next);app.unitCatalog={...(app.unitCatalog||{})};if(next)app.unitCatalog[code]=next;else delete app.unitCatalog[code];operationUnitCache?.clear?.();normalizeUnitQuantities([product]);renderStockViews();showToast('Unidade atualizada',`${product.produto}: ${next?next:'automática ('+productMeasureUnit(product)+')'}`);}
  catch(error){showToast('Não foi possível salvar a unidade',firebaseErrorMessage(error),'error');}
}

/* ---------- análise por loja ---------- */
function stockRow(product){
  const days=periodDays(),target=Number(app.settings.coverageDays)||7,unit=productMeasureUnit(product),stores={};let te=0,tv=0;
  for(const s of STORE_IDS){const e=num(product['estoque_atual_'+s]),v=num(product['venda_periodo_'+s]),daily=v/days,cov=daily>0?Math.max(0,e)/daily:(e>0?Infinity:0);
    let status='ok';if(e<-.001)status=v>0?'negative':'review';else if(v>0&&e<=.001)status='rupture';else if(v<=0&&e>.001)status='slow';else if(v<=0&&e<=.001)status='none';else if(cov<Math.min(3,target))status='low';else if(cov>Math.max(30,target*3))status='excess';
    stores[s]={e,v,daily,cov,status};te+=e;tv+=v;}
  const totalDaily=tv/days,cov=totalDaily>0?Math.max(0,te)/totalDaily:(te>0?Infinity:0);
  // transferência: loja em falta recebe da loja com mais cobertura, sem deixar a doadora abaixo da meta
  const transfers=[];const needs=STORE_IDS.filter(s=>['rupture','negative','low'].includes(stores[s].status)&&stores[s].daily>0);
  for(const to of needs){const need=Math.max(0,stores[to].daily*target-Math.max(0,stores[to].e));const from=STORE_IDS.filter(s=>s!==to).map(s=>({s,spare:stores[s].e-stores[s].daily*target*1.2})).filter(x=>x.spare>0).sort((a,b)=>b.spare-a.spare)[0];
    if(from&&need>0){let q=Math.min(need,from.spare);q=unit==='un'?Math.floor(q):Math.round(q*10)/10;if(q>0)transfers.push({from:from.s,to,q});}}
  const order=['negative','rupture','low','review','excess','slow','ok','none'],worst=STORE_IDS.map(s=>stores[s].status).sort((a,b)=>order.indexOf(a)-order.indexOf(b))[0];
  return{product,unit,stores,te,tv,cov,transfers,worst};
}
function stockMatch(r,key,store){const list=store==='all'?STORE_IDS:[store],st=list.map(s=>r.stores[s].status);return key==='all'?true:key==='transfer'?r.transfers.some(t=>store==='all'||t.to===store||t.from===store):key==='rupture'?st.includes('rupture'):key==='negative'?st.includes('negative')||st.includes('review'):key==='low'?st.includes('low'):key==='excess'?st.includes('excess'):key==='slow'?st.includes('slow'):true;}
const STATUS_TXT={negative:'Negativo',review:'Negativo sem venda',rupture:'Ruptura',low:'Cobertura baixa',excess:'Excesso',slow:'Sem giro',ok:'Saudável',none:'Sem movimento'};
function covText(c){return c===Infinity?'sem venda':c>=99?'99+ dias':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:c<10?1:0}).format(c)} d`;}
function stockCellHtml(x,unit,focus,i){const f=focus?' st-focus':'';return`<td class="st-cell st-${x.status}${f}" title="${STATUS_TXT[x.status]} · cobertura ${covText(x.cov)} · vende ${unitQty(x.daily,unit)}/dia"><b>${unitQty(x.e,unit)}</b><small>${covText(x.cov)}</small></td><td class="st-sale store-c${i+1}${f}"><b>${unitQty(x.v,unit)}</b></td>`;}

/* ---------- render ---------- */
function stockSortValue(r,key){if(key==='name')return r.product.produto;if(key==='family')return r.product.familia;if(key==='te')return r.te;if(key==='tv')return r.tv;if(key==='cov')return r.cov===Infinity?1e9:r.cov;if(key.startsWith('c'))return(r.stores[key.slice(1)]?.cov===Infinity?1e9:r.stores[key.slice(1)]?.cov)??0;if(key.startsWith('e'))return r.stores[key.slice(1)]?.e??0;if(key.startsWith('v'))return r.stores[key.slice(1)]?.v??0;return 0;}
function setStockView(view,prop,value){const v=STOCK_VIEW[view];if(prop==='filter')v.filter=v.filter===value&&value!=='all'?'all':value;else if(prop==='store')v.store=value;else if(prop==='sort'){v.sort=v.sort.key===value?{key:value,dir:-v.sort.dir}:{key:value,dir:['name','family'].includes(value)?1:-1};}renderStockView(view);}
function sortProducts(key){setStockView('products','sort',key);}
function renderStockView(view){
  const isExtras=view==='extras',v=STOCK_VIEW[view],side=sideFamilies(),ids=isExtras?{search:'extrasSearch',kpis:'extrasKpis',head:'extrasHead',body:'extrasBody',count:'extrasCountLabel',stores:'extrasStores',fam:'extrasFamilies'}:{search:'productSearch',kpis:'productKpis',head:'productHead',body:'productBody',count:'productCountLabel',stores:'productStores'};
  if(!document.getElementById(ids.body))return;
  const q=norm(document.getElementById(ids.search)?.value||'');
  const pool=visibleProducts().filter(p=>isExtras?side.has(p.familia):!side.has(p.familia)),famSel=isExtras?v.families:selectedProductFamilies;
  const base=pool.filter(p=>(!famSel.size||famSel.has(p.familia))&&(!q||norm(p.produto+' '+p.codigo_produto).includes(q))).map(stockRow);
  const rows=base.filter(r=>stockMatch(r,v.filter,v.store));
  const count=k=>base.filter(r=>stockMatch(r,k,v.store)).length;
  document.getElementById(ids.kpis).innerHTML=Object.entries(STOCK_FILTERS).map(([k,l])=>{const n=k==='all'?base.length:count(k);return`<button type="button" class="pk-chip${v.filter===k?' on':''}${n&&['rupture','negative'].includes(k)?' alert':''}" aria-pressed="${v.filter===k}" onclick="setStockView('${view}','filter','${k}')">${l}<strong>${n}</strong></button>`;}).join('');
  document.getElementById(ids.stores).innerHTML=[['all','Todas as lojas'],...STORE_IDS.map(s=>[s,STORES[s]])].map(([k,l])=>`<button type="button" class="pk-chip st-store${v.store===k?' on':''}" aria-pressed="${v.store===k}" onclick="setStockView('${view}','store','${k}')">${k!=='all'?`<i class="op3-dot" style="background:${STORE_COLORS[k]}"></i>`:''}${esc(l)}</button>`).join('');
  if(isExtras){const fams=[...new Set(pool.map(p=>p.familia))].sort((a,b)=>a.localeCompare(b,'pt-BR'));document.getElementById(ids.fam).innerHTML=bubbleButton('Todas','▦','#344054',!v.families.size,`toggleExtrasFamily('all')`)+fams.map(f=>bubbleButton(f,familyIcon(f),familyColor(f),v.families.has(f),`toggleExtrasFamily('${encodeURIComponent(f)}')`)).join('');renderSideFamilyConfig();}
  rows.sort((a,b)=>{const x=stockSortValue(a,v.sort.key),y=stockSortValue(b,v.sort.key);return v.sort.dir*(typeof x==='string'?x.localeCompare(y,'pt-BR'):x-y);});
  const arrow=k=>v.sort.key===k?(v.sort.dir>0?' ↑':' ↓'):'',th=(label,key,cls='num')=>`<th class="${cls} sortable" onclick="setStockView('${view}','sort','${key}')">${label}${arrow(key)}</th>`;
  document.getElementById(ids.head).innerHTML=`<tr>${th('Produto','name','st-name" rowspan="2')}${STORE_IDS.map((s,i)=>`<th class="store-group store-c${i+1}${v.store===s?' st-focus':''}" colspan="2"><i class="sdot"></i>${esc(STORES[s])}</th>`).join('')}<th class="store-group store-total" colspan="2">Total 3 lojas</th><th rowspan="2">Transferir</th>${th('Família','family','" rowspan="2')}<th rowspan="2"></th></tr><tr>${STORE_IDS.map((s,i)=>th('Estoque','e'+s,`num store-c${i+1}${v.store===s?' st-focus':''}`)+th('Vendas','v'+s,`num store-c${i+1}${v.store===s?' st-focus':''}`)).join('')}${th('Estoque','te','num store-total')}${th('Vendas','tv','num store-total')}</tr>`;
  const hidden=hiddenProductCodes();
  document.getElementById(ids.body).innerHTML=rows.length?rows.map(r=>{const p=r.product,code=encodeURIComponent(p.codigo_produto);return`<tr class="st-row"><td class="product st-name"><div class="pn-head"><span class="pn-name" title="${esc(p.produto)}">${esc(p.produto)}</span><button type="button" class="pn-btn" onclick="openProductNotes(decodeURIComponent('${code}'))" aria-label="Observações" title="Observações e compras">📝</button></div><small class="st-code">${esc(p.codigo_produto)} · <button type="button" class="st-unit" onclick="cycleProductUnit('${code}')" title="Unidade ${normalizeMeasureUnit(app.unitCatalog?.[cleanProductCode(p.codigo_produto)])?'definida por você':'automática'}. Clique para trocar kg/un.">${r.unit} ▾</button></small>${typeof productNoteBadge==='function'?productNoteBadge(p.codigo_produto):''}</td>${STORE_IDS.map((s,i)=>stockCellHtml(r.stores[s],r.unit,v.store===s,i)).join('')}<td class="st-cell st-total" title="Cobertura ${covText(r.cov)}"><b>${unitQty(r.te,r.unit)}</b><small>${covText(r.cov)}</small></td><td class="st-sale st-total"><b>${unitQty(r.tv,r.unit)}</b></td><td class="st-transfer">${r.transfers.map(t=>`<span title="Deixa ${esc(STORES[t.from])} com pelo menos ${app.settings.coverageDays||7} dias">${esc(STORES[t.from])} → ${esc(STORES[t.to])} <b>${unitQty(t.q,r.unit)} ${r.unit}</b></span>`).join('')||'<span class="op3-muted">—</span>'}</td><td class="famcell" style="--family:${familyColor(p.familia)}">${familyBadge(p.familia,true,p.codigo_produto)}</td><td>${visibilityButton(p,hidden)}</td></tr>`;}).join(''):`<tr><td colspan="13">${empty('Nenhum produto neste filtro','Revise a busca, a família ou o filtro.')}</td></tr>`;
  document.getElementById(ids.count).textContent=`${rows.length} de ${pool.length} produtos`;
}
function renderProducts(){renderStockView('products');}
function renderExtras(){renderStockView('extras');}
function renderStockViews(){renderProducts();renderExtras();}
function toggleExtrasFamily(encoded){const f=encoded==='all'?'all':decodeURIComponent(encoded),set=STOCK_VIEW.extras.families;if(f==='all')set.clear();else if(set.has(f))set.delete(f);else set.add(f);renderExtras();}
function renderSideFamilyConfig(){const box=document.getElementById('extrasConfig');if(!box)return;const side=sideFamilies();box.innerHTML=familyList().map(f=>`<label class="st-fam"><input type="checkbox" ${side.has(f)?'checked':''} onchange="setSideFamily('${encodeURIComponent(f)}',this.checked)"> ${esc(f)}</label>`).join('');}
function setSideFamily(encoded,on){const f=decodeURIComponent(encoded),side=sideFamilies();if(on)side.add(f);else side.delete(f);app.settings.sideFamilies=[...side].sort();STOCK_VIEW.extras.families.delete(f);selectedProductFamilies.delete(f);saveState();renderFamilyChips();renderStockViews();queueCentralSave('side_families');showToast(on?'Família movida para Complementos':'Família voltou para Produtos',f);}
function bindStockViews(){document.getElementById('extrasSearch')?.addEventListener('input',renderExtras);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindStockViews);else bindStockViews();
