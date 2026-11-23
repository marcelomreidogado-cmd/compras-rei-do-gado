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
  const result={kinds:{},kindValues:{},out:0,loss:0,outValue:0,lossValue:0,sale:0,saleValue:0,purchase:0,purchaseValue:0,operations:new Map(),count:rows.length};
  for(const r of rows){const kind=pcpKind(r),q=Math.abs(num(r.quantity)),v=Math.abs(num(r.movementValue));result.kinds[kind]=(result.kinds[kind]||0)+q;
    result.kindValues[kind]=(result.kindValues[kind]||0)+v;
    if(kind==='sale'){result.sale+=q;result.saleValue+=v;}
    if(kind==='purchase'){result.purchase+=q;result.purchaseValue+=v;}
    if(PCP_OUT.includes(kind)){result.out+=q;result.outValue+=v;const key=r.operation||r.operationCode;result.operations.set(key,(result.operations.get(key)||0)+q);}
    if(PCP_LOSS.includes(kind)){result.loss+=q;result.lossValue+=v;}
  }return result;
}
function pcpPercent(a,b){return b>0?fmtQty(a/b*100,1)+'%':'Sem venda na base';}
function pcpQty(n,unit){if(unit==='unknown')return '—';return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:unit==='kg'?3:0,maximumFractionDigits:unit==='kg'?3:0}).format(num(n))+' '+(unit==='kg'?'kg':'un.');}
function pcpTable(headers,rows){return '<div class="tablewrap"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
let pcpLimit=30;
function pcpSetLimit(value){pcpLimit=value;renderOperations();}
function pcpSection(title,subtitle,body){return '<div class="card pcp-section"><div class="cardhead"><h2>'+title+'</h2></div><div class="cardbody">'+body+'</div></div>';}
function pcpChooseWeek(start){document.getElementById('operationStart').value=start;document.getElementById('operationEnd').value=pcpDay(start,6);renderOperations();}
function pcpCoverage(store,start,end){
  const intervals=(app.operationsMeta?.imports||[]).filter(i=>i.store===store);let covered=0,total=0;
  for(let d=start;d<=end;d=pcpDay(d,1)){total++;if(intervals.some(i=>i.start<=d&&i.end>=d))covered++;}
  return {covered,total,complete:total>0&&covered===total};
}
