/* Gerencial PCP: quantidades por unidade, valores registrados e semanas civis. */
function pcpMonday(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function pcpDay(date,offset){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function pcpKind(r){
  const code=r.operationCode,n=norm(r.operation);
  if(r.category==='sale')return 'sale';
  if(['000141','000142','000143','000144'].includes(code)||/compra/.test(n))return 'purchase';
  if(r.category==='loss')return /limpeza/.test(n)?'clean':/sangue/.test(n)?'blood':/liquido/.test(n)?'liquid':'loss';
  if(r.category==='inventory')return code==='000097'||/entrada/.test(n)?'adjustIn':'adjustOut';
  if(r.category==='transfer')return /entrada/.test(n)?'transferIn':'transferOut';
  if(r.category==='entry'||/entrada|devolucao/.test(n))return 'entry';
  if(r.category==='production')return 'production';
  return 'unknown';
}
const PCP_OUT=['clean','blood','liquid','loss','adjustOut','transferOut','production'];
const PCP_LOSS=['clean','blood','liquid','loss'];
function pcpAggregate(rows){
  const result={kinds:{},out:0,loss:0,outValue:0,lossValue:0,sale:0,saleValue:0,purchase:0,purchaseValue:0,operations:new Map(),count:rows.length};
  for(const r of rows){const kind=pcpKind(r),q=Math.abs(num(r.quantity)),v=Math.abs(num(r.movementValue));result.kinds[kind]=(result.kinds[kind]||0)+q;
    if(kind==='sale'){result.sale+=q;result.saleValue+=v;}
    if(kind==='purchase'){result.purchase+=q;result.purchaseValue+=v;}
    if(PCP_OUT.includes(kind)){result.out+=q;result.outValue+=v;const key=r.operation||r.operationCode;result.operations.set(key,(result.operations.get(key)||0)+q);}
    if(PCP_LOSS.includes(kind)){result.loss+=q;result.lossValue+=v;}
  }return result;
}
function pcpPercent(a,b){return b>0?fmtQty(a/b*100,1)+'%':'Sem venda na base';}
function pcpQty(n,unit){return fmtQty(n,unit==='kg'?3:0)+' '+(unit==='kg'?'kg':'un.');}
function pcpTable(headers,rows){return '<div class="tablewrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
function pcpSection(title,subtitle,body){return '<div class="card" style="margin:16px 0"><div class="cardhead"><h2>'+title+'</h2></div><div class="cardbody"><p style="color:#667085;margin:0 0 14px">'+subtitle+'</p>'+body+'</div></div>';}
function pcpChooseWeek(start){document.getElementById('operationStart').value=start;document.getElementById('operationEnd').value=pcpDay(start,6);renderOperations();}
function pcpCoverage(store,start,end){
  const intervals=(app.operationsMeta?.imports||[]).filter(i=>i.store===store);let covered=0,total=0;
  for(let d=start;d<=end;d=pcpDay(d,1)){total++;if(intervals.some(i=>i.start<=d&&i.end>=d))covered++;}
  return {covered,total,complete:total>0&&covered===total};
}
function renderPcpDashboard(){
  const target=document.getElementById('pcpDashboard');if(!target)return;
  const start=document.getElementById('operationStart').value,end=document.getElementById('operationEnd').value;
  if(!start||!end||start>end){target.innerHTML=pcpSection('Painel gerencial PCP','Selecione um período válido e importe os extratos completos.','');return;}
  const query=norm(document.getElementById('operationSearch').value),matches=r=>!query||norm(r.productCode+' '+r.productName).includes(query);
  const period=app.operations.filter(r=>r.date>=start&&r.date<=end&&matches(r)),rows=period.filter(r=>selectedOperationStore==='all'||r.store===selectedOperationStore);
  const stores=selectedOperationStore==='all'?STORE_IDS:[selectedOperationStore];
  let html=pcpSection('Painel gerencial PCP · vendas × operações','Usa as vendas do próprio extrato no mesmo período, produto e loja. A busca gerencial considera produto/código. Os filtros de categoria e de movimentação abaixo não retiram a base de vendas. Valores em R$ são os registrados no extrato, não uma estimativa de lucro.',stores.map(s=>{const c=pcpCoverage(s,start,end);return '<span class="op-badge">'+esc(STORES[s])+': '+c.covered+'/'+c.total+' dias cobertos pelos intervalos importados'+(c.complete?'':' · base parcial')+'</span>';}).join(' ')+'<p>Limpeza ÷ vendas é uma relação operacional, não rendimento de desossa. Exemplo: 15 kg ÷ 50 kg = 30%. Rendimento exige vínculo entre entrada, processamento, estoque e subprodutos.</p>');
  for(const unit of ['kg','un']){
    const subset=rows.filter(r=>operationMeasureUnit(r)===unit),a=pcpAggregate(subset),groups=new Map();
    for(const r of subset){if(!groups.has(r.productCode))groups.set(r.productCode,[]);groups.get(r.productCode).push(r);}
    const rank=[...groups].map(([code,items])=>({code,name:items[0].productName,a:pcpAggregate(items)})).filter(p=>p.a.out>0).sort((a,b)=>b.a.out-a.a.out||a.code.localeCompare(b.code)).slice(0,15);
    html+=pcpSection('Resultado · '+(unit==='kg'?'quilos':'unidades'),'Saídas operacionais excluem vendas e entradas. Produção, transferências e ajustes são identificados separadamente de perdas e limpezas.', '<div class="kpis">'+[
      kpi('Vendas',pcpQty(a.sale,unit),fmtCurrency(a.saleValue)),kpi('Compras',pcpQty(a.purchase,unit),fmtCurrency(a.purchaseValue)),kpi('Perdas e limpezas',pcpQty(a.loss,unit),fmtCurrency(a.lossValue),'danger'),kpi('Perdas / vendas',pcpPercent(a.loss,a.sale),'base: quantidade vendida'),kpi('Saídas operacionais',pcpQty(a.out,unit),fmtCurrency(a.outValue))].join('')+'</div>');
    html+=pcpSection('Top 15 produtos · '+(unit==='kg'?'kg':'un.'),'Ordenado por quantidade de saídas operacionais. Clique no produto para conferir os lançamentos. Produtos com códigos distintos não são agrupados como se fossem a mesma peça.',pcpTable(['Produto','Compras','Vendas','Saídas operacionais','Limpeza','Sangue','Líquido','Outras perdas','Perdas / vendas','R$ compras','R$ vendas','R$ saídas','Quais operações'],rank.map(p=>{const a=p.a;return '<tr><td><button class="btn sm" onclick="selectOperationProduct(\''+encodeURIComponent(p.code)+'\')">'+esc(p.name)+'</button><small>'+esc(p.code)+'</small></td>'+[pcpQty(a.purchase,unit),pcpQty(a.sale,unit),pcpQty(a.out,unit),pcpQty(a.kinds.clean||0,unit),pcpQty(a.kinds.blood||0,unit),pcpQty(a.kinds.liquid||0,unit),pcpQty(a.kinds.loss||0,unit),pcpPercent(a.loss,a.sale),fmtCurrency(a.purchaseValue),fmtCurrency(a.saleValue),fmtCurrency(a.outValue)].map(v=>'<td class="num"><strong>'+v+'</strong></td>').join('')+'<td>'+[...a.operations].sort((a,b)=>b[1]-a[1]).map(([n,q])=>esc(n)+': <b>'+pcpQty(q,unit)+'</b>').join('<br>')+'</td></tr>';})));
    const allUnit=period.filter(r=>operationMeasureUnit(r)===unit),total=pcpAggregate(allUnit);
    html+=pcpSection('Influência das lojas · '+(unit==='kg'?'kg':'un.'),'Comparação das três lojas para o mesmo período e produto pesquisado. Participação calculada sobre o valor registrado de perdas e limpezas da rede; bases parciais exigem cautela.',pcpTable(['Loja','Cobertura','Vendas','Perdas e limpezas','Perdas / vendas','R$ perdas','Participação R$ perdas'],STORE_IDS.map(s=>{const a=pcpAggregate(allUnit.filter(r=>r.store===s)),c=pcpCoverage(s,start,end);return '<tr><td>'+esc(STORES[s])+'</td><td>'+c.covered+'/'+c.total+' dias</td><td>'+pcpQty(a.sale,unit)+'</td><td>'+pcpQty(a.loss,unit)+'</td><td>'+pcpPercent(a.loss,a.sale)+'</td><td>'+fmtCurrency(a.lossValue)+'</td><td>'+(total.lossValue?fmtQty(a.lossValue/total.lossValue*100,1)+'%':'—')+'</td></tr>';})));
    const history=app.operations.filter(r=>(selectedOperationStore==='all'||r.store===selectedOperationStore)&&matches(r)&&operationMeasureUnit(r)===unit),weeks=new Map();
    for(const r of history){const week=pcpMonday(r.date);if(!weeks.has(week))weeks.set(week,[]);weeks.get(week).push(r);}
    const weekKeys=[...weeks.keys()].sort().reverse();
    html+=pcpSection('Histórico semanal · '+(unit==='kg'?'kg':'un.'),'Segunda a domingo, incluindo meses anteriores importados. Variação em pontos percentuais da relação perdas/vendas contra a semana imediatamente anterior, somente quando ambas têm cobertura integral declarada para as lojas selecionadas. Clique na semana para filtrar o painel.',pcpTable(['Semana','Cobertura','Compras','Vendas','Perdas / limpeza','Perdas / vendas','Δ semana anterior','R$ compras','R$ vendas','R$ perdas'],weekKeys.map(w=>{const a=pcpAggregate(weeks.get(w)),prev=pcpDay(w,-7),b=pcpAggregate(weeks.get(prev)||[]),complete=stores.every(s=>pcpCoverage(s,w,pcpDay(w,6)).complete),previousComplete=stores.every(s=>pcpCoverage(s,prev,pcpDay(prev,6)).complete),delta=complete&&previousComplete&&a.sale>0&&b.sale>0?fmtQty((a.loss/a.sale-b.loss/b.sale)*100,1)+' p.p.':'Não comparável';return '<tr><td><button class="btn sm" onclick="pcpChooseWeek(\''+w+'\')">'+formatDate(w)+' a '+formatDate(pcpDay(w,6))+'</button></td><td>'+(complete?'Intervalo coberto':'Base parcial')+'</td><td>'+pcpQty(a.purchase,unit)+'</td><td>'+pcpQty(a.sale,unit)+'</td><td>'+pcpQty(a.loss,unit)+'</td><td>'+pcpPercent(a.loss,a.sale)+'</td><td>'+delta+'</td><td>'+fmtCurrency(a.purchaseValue)+'</td><td>'+fmtCurrency(a.saleValue)+'</td><td>'+fmtCurrency(a.lossValue)+'</td></tr>';})));
  }
  const unknown=rows.filter(r=>pcpKind(r)==='unknown');if(unknown.length)html+=pcpSection('Conferência necessária',unknown.length+' lançamentos sem direção conhecida foram excluídos do ranking de saídas. Confira-os no detalhamento.',[...new Set(unknown.map(r=>r.operation))].map(esc).join(' · '));
  target.innerHTML=html;
}
