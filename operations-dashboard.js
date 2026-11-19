/* Comparação de operações por produto/família, sempre com vendas do mesmo extrato. */
let pcpUnit='kg',pcpMetric='clean',pcpGroup='product',pcpFamilyFilter='',pcpCompareMode='previous';
const PCP_METRICS={clean:'Limpeza',loss:'Todas as perdas',adjustOut:'Ajustes de saída'};
function operationUnitsFromRows(rows){
 if(!rows.length)throw new Error('O arquivo está vazio.');
 const cols=detectColumns([...new Set(rows.flatMap(Object.keys))]);if(!cols.code||!cols.unit)throw new Error('O relatório precisa das colunas Código do produto e Unidade.');
 const units={};for(const row of rows){const code=cleanProductCode(row[cols.code]),unit=normalizeMeasureUnit(row[cols.unit]);if(!code||!unit)continue;if(units[code]&&units[code]!==unit)throw new Error('Unidades conflitantes para o produto '+code);units[code]=unit;}
 if(!Object.keys(units).length)throw new Error('Nenhuma unidade kg ou un foi encontrada.');return units;
}
async function importOperationUnits(file){
 if(!file)return;try{
 if(!fbDB||!currentUser||!syncReady)throw new Error('Aguarde a conexão com a base central.');
 let rows;
 if(/\.csv$/i.test(file.name)){const lines=(await file.text()).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean),delimiter=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',',head=parseCsvLine(lines.shift(),delimiter);rows=lines.map(l=>{const values=parseCsvLine(l,delimiter);return Object.fromEntries(head.map((h,i)=>[h,values[i]]));});}
 else{if(typeof XLSX==='undefined')throw new Error('Leitor de planilhas indisponível.');const book=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:''});}
 const units=operationUnitsFromRows(rows),saved=await fbDB.ref(CENTRAL_PATH+'/unitCatalog').transaction(old=>({...old,...units}));
 if(!saved.committed)throw new Error('Não foi possível salvar as unidades.');app.unitCatalog=saved.snapshot.val();saveState();renderAll();showToast('Unidades atualizadas',Object.keys(units).length+' produtos atualizados em todas as lojas.');
 }catch(error){showToast('Unidades não atualizadas',error.message,'error');}
}
function pcpSet(key,value){value=decodeURIComponent(value);if(key==='unit')pcpUnit=value;if(key==='metric')pcpMetric=value;if(key==='group')pcpGroup=value;if(key==='family')pcpFamilyFilter=value;if(key==='compare')pcpCompareMode=value;renderOperations();}
function pcpFamily(row){
 const name=String(row.productName||'').toUpperCase();
 if(!/^HB(?:\s|[.-])/.test(name)){if(/\bPATINHO\b/.test(name))return 'PATINHO';if(/\bALCATRA\b/.test(name))return 'ALCATRA';}
 return app.products.find(p=>cleanProductCode(p.codigo_produto)===cleanProductCode(row.productCode))?.familia||'SEM FAMÍLIA';
}
function pcpMetricQty(a){return pcpMetric==='loss'?a.loss:(a.kinds[pcpMetric]||0);}
function pcpMetricValue(a){return pcpMetric==='loss'?a.lossValue:(a.kindValues[pcpMetric]||0);}
function pcpRange(start,end){
 const length=Math.round((new Date(end+'T12:00:00Z')-new Date(start+'T12:00:00Z'))/86400000)+1;
 return pcpCompareMode==='custom'?{start:document.getElementById('pcpCompareStart')?.value,end:document.getElementById('pcpCompareEnd')?.value}:{start:pcpDay(start,-length),end:pcpDay(start,-1)};
}
function pcpGroups(rows,group=pcpGroup){
 const map=new Map();for(const r of rows){const key=group==='family'?pcpFamily(r):cleanProductCode(r.productCode);if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
 return [...map].map(([code,items])=>({code,name:group==='family'?code:items[0].productName,items,a:pcpAggregate(items),unit:new Set(items.map(operationMeasureUnit)).size===1?operationMeasureUnit(items[0]):'unknown'}));
}
function pcpDelta(a,b,comparable){return comparable&&a.sale>0&&b.sale>0?fmtQty((pcpMetricQty(a)/a.sale-pcpMetricQty(b)/b.sale)*100,1)+' p.p.':'—';}
function pcpButtons(options,current,key){return '<div class="family-chips">'+Object.entries(options).map(([v,l])=>'<button class="btn sm '+(current===v?'primary':'')+'" aria-pressed="'+(current===v)+'" onclick="pcpSet(\''+key+'\',\''+encodeURIComponent(v).replace(/'/g,'%27')+'\')">'+esc(l)+'</button>').join('')+'</div>';}
function pcpOpenFamily(code){pcpFamilyFilter=decodeURIComponent(code);pcpGroup='product';renderOperations();}
function pcpProductCell(p){return '<td class="pcp-name"><button class="btn sm" onclick="'+(pcpGroup==='family'?'pcpOpenFamily':'selectOperationProduct')+'(\''+encodeURIComponent(p.code).replace(/'/g,'%27')+'\')">'+esc(p.name)+'</button><small>'+esc(pcpGroup==='family'?new Set(p.items.map(r=>r.productCode)).size+' produtos':p.code)+'</small></td>';}
function pcpCards(products){return '<div class="pcp-mobile-cards">'+products.map((p,i)=>{const a=p.a,u=pcpUnit==='all'?p.unit:pcpUnit;return '<button class="pcp-product-card" onclick="'+(pcpGroup==='family'?'pcpOpenFamily':'selectOperationProduct')+'(\''+encodeURIComponent(p.code).replace(/'/g,'%27')+'\')"><strong>'+String(i+1)+'. '+esc(p.name)+'</strong><div class="pcp-card-values"><span>Vendas<b>'+pcpQty(a.sale,u)+'</b><small>'+fmtCurrency(a.saleValue)+'</small></span><span>'+esc(PCP_METRICS[pcpMetric])+'<b>'+pcpQty(pcpMetricQty(a),u)+'</b><small>'+fmtCurrency(pcpMetricValue(a))+'</small></span><span>Sobre vendas · qtd.<b>'+(u==='unknown'?'—':pcpPercent(pcpMetricQty(a),a.sale))+'</b></span><span>Sobre vendas · R$<b>'+pcpPercent(pcpMetricValue(a),a.saleValue)+'</b></span></div></button>';}).join('')+'</div>';}
function renderPcpDashboard(){
 const target=document.getElementById('pcpDashboard');if(!target)return;
 const start=document.getElementById('operationStart').value,end=document.getElementById('operationEnd').value;
 if(!start||!end||start>end){target.innerHTML=pcpSection('Perdas, limpeza e inventário','','');return;}
 const query=norm(document.getElementById('operationSearch').value),matches=r=>(!query||norm(r.productCode+' '+r.productName+' '+pcpFamily(r)).includes(query))&&(!pcpFamilyFilter||pcpFamily(r)===pcpFamilyFilter);
 const all=app.operations.filter(matches),storeMatch=r=>selectedOperationStore==='all'||r.store===selectedOperationStore;
 const current=all.filter(r=>r.date>=start&&r.date<=end),rows=current.filter(storeMatch),pending=rows.filter(r=>operationMeasureUnit(r)==='unknown');
 const unitMatch=r=>pcpUnit==='all'||operationMeasureUnit(r)===pcpUnit,subset=rows.filter(unitMatch),a=pcpAggregate(subset),range=pcpRange(start,end),validCompare=range.start&&range.end&&range.start<=range.end;
 const previous=validCompare?all.filter(r=>storeMatch(r)&&unitMatch(r)&&r.date>=range.start&&r.date<=range.end):[],stores=selectedOperationStore==='all'?STORE_IDS:[selectedOperationStore];
 const complete=validCompare&&stores.every(s=>pcpCoverage(s,start,end).complete&&pcpCoverage(s,range.start,range.end).complete),b=pcpAggregate(previous),metric=PCP_METRICS[pcpMetric],unit=pcpUnit==='all'?'unknown':pcpUnit;
 const groups=pcpGroups(subset).sort((x,y)=>(pcpUnit==='all'?pcpMetricValue(y.a)-pcpMetricValue(x.a):pcpMetricQty(y.a)-pcpMetricQty(x.a))||pcpMetricValue(y.a)-pcpMetricValue(x.a)||x.name.localeCompare(y.name)),past=new Map(pcpGroups(previous).map(p=>[p.code,p.a]));
 const familyOptions=Object.fromEntries([['','Todas as famílias'],...[...new Set(app.operations.map(pcpFamily))].sort().map(f=>[f,f])]);
 let html=pcpSection('Perdas, limpeza e inventário','',pcpButtons({kg:'⚖️ Quilos',un:'📦 Unidades',all:'R$ Todos os produtos'},pcpUnit,'unit')+pcpButtons(PCP_METRICS,pcpMetric,'metric')+pcpButtons({product:'Por produto',family:'Por família'},pcpGroup,'group')+pcpButtons(familyOptions,pcpFamilyFilter,'family')+(pending.length?'<div class="pcp-status"><button class="btn sm" onclick="pcpSet(\'unit\',\'all\')">'+new Set(pending.map(r=>r.productCode)).size+' produtos sem unidade · ver valores</button> <button class="btn sm" onclick="document.getElementById(\'operationUnitFile\').click()">Atualizar unidades</button></div>':''));
 html+=pcpSection(metric+' × vendas · '+(pcpUnit==='all'?'valores':pcpUnit),'','<div class="kpis">'+[
 kpi('Vendas',pcpUnit==='all'?fmtCurrency(a.saleValue):pcpQty(a.sale,unit),pcpUnit==='all'?'':fmtCurrency(a.saleValue)),
 kpi(metric,pcpUnit==='all'?fmtCurrency(pcpMetricValue(a)):pcpQty(pcpMetricQty(a),unit),pcpUnit==='all'?'':fmtCurrency(pcpMetricValue(a)),'danger'),
 kpi(metric+' / vendas · '+(pcpUnit==='all'?'R$':unit),pcpPercent(pcpUnit==='all'?pcpMetricValue(a):pcpMetricQty(a),pcpUnit==='all'?a.saleValue:a.sale),''),
 kpi(metric+' / vendas · R$',pcpPercent(pcpMetricValue(a),a.saleValue),fmtCurrency(pcpMetricValue(a))+' / '+fmtCurrency(a.saleValue))].join('')+'</div>');
 const limits='<div class="family-chips">'+[15,20,30,0].map(n=>'<button class="btn sm '+(pcpLimit===n?'primary':'')+'" onclick="pcpSetLimit('+n+')">'+(n?'Top '+n:'Todos')+'</button>').join('')+'</div>';
 html+=pcpSection((pcpLimit?'Top '+pcpLimit:'Todos')+' · '+metric+' · '+(pcpUnit==='all'?'R$':pcpUnit),'',limits+pcpCards(groups.slice(0,pcpLimit||undefined))+pcpTable(['Produto / família','Vendas','Limpeza','Sangue / líquido','Outras perdas','Ajuste saída','R$ vendas','R$ '+metric,metric+' / vendas · qtd.',metric+' / vendas · R$','Anterior · qtd.','Δ qtd. / vendas'],groups.slice(0,pcpLimit||undefined).map(p=>{const q=p.a,prior=past.get(p.code)||pcpAggregate([]),u=pcpUnit==='all'?p.unit:pcpUnit;return '<tr>'+pcpProductCell(p)+[pcpQty(q.sale,u),pcpQty(q.kinds.clean||0,u),pcpQty((q.kinds.blood||0)+(q.kinds.liquid||0),u),pcpQty(q.kinds.loss||0,u),pcpQty(q.kinds.adjustOut||0,u),fmtCurrency(q.saleValue),fmtCurrency(pcpMetricValue(q)),u==='unknown'?'—':pcpPercent(pcpMetricQty(q),q.sale),pcpPercent(pcpMetricValue(q),q.saleValue),pcpQty(pcpMetricQty(prior),u),u==='unknown'?'—':pcpDelta(q,prior,complete)].map(v=>'<td class="num"><strong>'+v+'</strong></td>').join('')+'</tr>';})));
 html+=pcpSection('Comparativo de períodos','',pcpButtons({previous:'Período anterior equivalente',custom:'Escolher comparação'},pcpCompareMode,'compare')+'<div class="pcp-periods"><span>Atual: <b>'+formatDate(start)+' a '+formatDate(end)+'</b></span><span>Comparação: <b>'+(validCompare?formatDate(range.start)+' a '+formatDate(range.end):'Selecione as datas')+'</b></span></div><div class="purchasebox '+(pcpCompareMode==='custom'?'':'pcp-hidden')+'"><div class="field"><label for="pcpCompareStart">Comparar de</label><input id="pcpCompareStart" type="date" value="'+(range.start||'')+'" onchange="renderOperations()"></div><div class="field"><label for="pcpCompareEnd">Até</label><input id="pcpCompareEnd" type="date" value="'+(range.end||'')+'" onchange="renderOperations()"></div></div>'+pcpTable(['Indicador','Atual','Comparação','Variação'],[
 '<tr><td>Vendas</td><td>'+fmtCurrency(a.saleValue)+'</td><td>'+fmtCurrency(b.saleValue)+'</td><td>'+(complete?fmtCurrency(a.saleValue-b.saleValue):'Base parcial')+'</td></tr>',
 '<tr><td>'+metric+'</td><td>'+fmtCurrency(pcpMetricValue(a))+'</td><td>'+fmtCurrency(pcpMetricValue(b))+'</td><td>'+(complete?fmtCurrency(pcpMetricValue(a)-pcpMetricValue(b)):'Base parcial')+'</td></tr>',
 '<tr><td>'+metric+' / vendas · R$</td><td>'+pcpPercent(pcpMetricValue(a),a.saleValue)+'</td><td>'+pcpPercent(pcpMetricValue(b),b.saleValue)+'</td><td>'+(complete&&a.saleValue&&b.saleValue?fmtQty((pcpMetricValue(a)/a.saleValue-pcpMetricValue(b)/b.saleValue)*100,1)+' p.p.':'—')+'</td></tr>']));
 const allUnit=current.filter(unitMatch),total=pcpAggregate(allUnit);
 html+=pcpSection('Comparativo entre lojas','',pcpTable(['Loja','Dias com base','Vendas','R$ vendas',metric,'R$ '+metric,metric+' / vendas · R$','Participação R$'],STORE_IDS.map(s=>{const q=pcpAggregate(allUnit.filter(r=>r.store===s)),c=pcpCoverage(s,start,end);return '<tr><td>'+esc(STORES[s])+'</td><td>'+c.covered+'/'+c.total+'</td><td>'+pcpQty(q.sale,unit)+'</td><td>'+fmtCurrency(q.saleValue)+'</td><td>'+pcpQty(pcpMetricQty(q),unit)+'</td><td>'+fmtCurrency(pcpMetricValue(q))+'</td><td>'+pcpPercent(pcpMetricValue(q),q.saleValue)+'</td><td>'+(pcpMetricValue(total)?fmtQty(pcpMetricValue(q)/pcpMetricValue(total)*100,1)+'%':'—')+'</td></tr>';})));
 const history=all.filter(r=>storeMatch(r)&&unitMatch(r)),weeks=new Map();for(const r of history){const w=pcpMonday(r.date);if(!weeks.has(w))weeks.set(w,[]);weeks.get(w).push(r);}
 html+=pcpSection('Histórico semanal · segunda a domingo','',pcpTable(['Semana','Base','Vendas',metric,metric+' / vendas · qtd.','R$ vendas','R$ '+metric,metric+' / vendas · R$','Δ qtd. / vendas'],[...weeks.keys()].sort().reverse().map(w=>{const q=pcpAggregate(weeks.get(w)),prev=pcpDay(w,-7),prior=pcpAggregate(weeks.get(prev)||[]),covered=stores.every(s=>pcpCoverage(s,w,pcpDay(w,6)).complete),both=covered&&stores.every(s=>pcpCoverage(s,prev,pcpDay(prev,6)).complete);return '<tr><td><button class="btn sm" onclick="pcpChooseWeek(\''+w+'\')">'+formatDate(w)+' a '+formatDate(pcpDay(w,6))+'</button></td><td>'+(covered?'Intervalo coberto':'Base parcial')+'</td><td>'+pcpQty(q.sale,unit)+'</td><td>'+pcpQty(pcpMetricQty(q),unit)+'</td><td>'+(unit==='unknown'?'—':pcpPercent(pcpMetricQty(q),q.sale))+'</td><td>'+fmtCurrency(q.saleValue)+'</td><td>'+fmtCurrency(pcpMetricValue(q))+'</td><td>'+pcpPercent(pcpMetricValue(q),q.saleValue)+'</td><td>'+(unit==='unknown'?'—':pcpDelta(q,prior,both))+'</td></tr>';})));
 target.innerHTML=html;
}
