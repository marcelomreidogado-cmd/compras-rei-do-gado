/* Leitor do "Extrato de Produtos - Com Saldo e Resumo por Operação" (Alterdata).
   Funciona no navegador (pdf.js) e no Node (testes). Um PDF pode trazer as 3 lojas:
   a loja é lida em CADA página ("FILIAL CORONEL" / "Empresa 001"), nunca uma vez só.
   Colunas lidas pela borda direita do texto, que é fixa no relatório:
   Nr.Doc ≈434 · Quantidade ≈464 · Pr.Unitário ≈511 · Vl.Movimento ≈567.
   No resumo final: Quantidade ≈331 · Valor ≈430. */
(function(root){
const EXTRATO_STORES={CORONEL:'001',CORREAS:'002','CORRÊAS':'002',BINGEN:'003'};
const COL={doc:434,qty:464,price:511,value:567,sumQty:331,sumValue:430};
const near=(item,edge,tol=9)=>Math.abs(item.x+item.w-edge)<=tol;
const MONEY=/^-?\d{1,3}(\.\d{3})*,\d{1,4}$|^-?\d+,\d{1,4}$|^-?\d+$/;
function ptNumber(text){const t=String(text||'').trim();if(!MONEY.test(t))return null;return Number(t.replace(/\./g,'').replace(',','.'));}
function isoDate(text){const m=String(text||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
function groupLines(items){
  const lines=[];
  for(const it of items){const s=String(it.s??it.str??'').trim();if(!s)continue;const item={s,x:+it.x,y:+it.y,w:+(it.w||0)};let line=lines.find(l=>Math.abs(l.y-item.y)<1.6);if(!line){line={y:item.y,items:[]};lines.push(line);}line.items.push(item);}
  return lines.sort((a,b)=>b.y-a.y).map(l=>({y:l.y,items:l.items.sort((a,b)=>a.x-b.x),text:l.items.sort((a,b)=>a.x-b.x).map(i=>i.s).join(' ').replace(/\s+/g,' ')}));
}
function storeFromText(text){const m=String(text).toUpperCase().match(/FILIAL\s+(CORONEL|CORREAS|CORRÊAS|BINGEN)/);return m?EXTRATO_STORES[m[1]]:'';}

/* pages: [[{s,x,y,w}]] — texto de cada página. Devolve linhas, conferência e avisos. */
function parseExtratoPages(pages){
  const rows=[],warnings=[],opNames={},products={},balances={};
  let store='',product=null,inSummary=false,summaryQty=0,summaryValue=0,summaryLines=0,unknownStoreRows=0;
  pages.forEach((items,pageIndex)=>{
    const lines=groupLines(items);
    const headerStore=lines.slice(0,6).map(l=>storeFromText(l.text)).find(Boolean);
    if(headerStore&&headerStore!==store){store=headerStore;product=null;}
    for(const line of lines){
      const t=line.text;
      const emp=t.match(/^Empresa\s+(\d{3})\b/);if(emp){store=['001','002','003'].includes(emp[1])?emp[1]:'';product=null;continue;}
      if(/^Resumo por operação$/.test(t)){inSummary=true;continue;}
      if(inSummary){
        if(/Filtros Utilizados|Faixa de Valores|Tipo de Documento/.test(t)&&summaryLines)inSummary=false;
        for(const it of line.items){const n=ptNumber(it.s);if(n==null||!/,/.test(it.s))continue;if(near(it,COL.sumQty,12)){summaryQty+=n;summaryLines++;}else if(near(it,COL.sumValue,12))summaryValue+=n;}
        continue;
      }
      const first=line.items[0];if(!first||first.x>70)continue;
      const date=isoDate(first.s);
      if(!date){
        if(/^\d{6,14}$/.test(first.s)){const name=line.items.filter(i=>i.x>=100&&i.x<390).map(i=>i.s).join(' ').trim();if(name&&!/saldo|página|pagina|empresa/i.test(name)){product={code:first.s,name};products[first.s]=name;}}
        continue;
      }
      const opItem=line.items.find(i=>i.x>=65&&i.x<110&&/^\d{6}$/.test(i.s));if(!opItem)continue;
      if(!product){warnings.push(`Página ${pageIndex+1}: movimentação sem produto identificado.`);continue;}
      if(!store){unknownStoreRows++;continue;}
      const opName=line.items.filter(i=>i.x>=105&&i.x<195).map(i=>i.s).join(' ').trim();if(opName&&!opNames[opItem.s])opNames[opItem.s]=opName;
      let qty=null,price=null,value=null;
      for(const it of line.items){const n=ptNumber(it.s);if(n==null)continue;if(near(it,COL.qty))qty=n;else if(near(it,COL.price))price=n;else if(near(it,COL.value))value=n;}
      const nearby=[line,...lines.filter(l=>l!==line&&Math.abs(l.y-line.y)<2.5)];
      const docItem=nearby.flatMap(l=>l.items).find(i=>near(i,COL.doc,4)&&!/\s/.test(i.s));
      let derived=false;
      if(qty==null&&price&&value!=null){qty=Math.round(value/price*1000)/1000;derived=true;}
      if(qty==null||value==null){warnings.push(`Página ${pageIndex+1}: ${product.name} em ${date.split('-').reverse().join('/')} sem ${qty==null?'quantidade':'valor'}.`);continue;}
      rows.push({date,store,productCode:product.code,productName:product.name,operationCode:opItem.s,quantity:qty,unitPrice:price??(qty?value/qty:0),movementValue:value,document:docItem?.s||'',qtyDerived:derived||undefined});
    }
    // Saldos: "Saldo Inicial 44" / "Saldo Final 32" (por loja e produto)
    for(const line of lines){const m=line.text.match(/Saldo (Inicial|Final)/);if(!m||!product||!store)continue;const n=line.items.map(i=>near(i,COL.qty)?ptNumber(i.s):null).find(v=>v!=null);if(n==null)continue;const key=store+'|'+product.code;(balances[key]=balances[key]||{})[m[1]==='Inicial'?'start':'end']=n;}
  });
  if(unknownStoreRows)warnings.unshift(`${unknownStoreRows} movimentações sem loja identificada foram ignoradas (ex.: MATRIZ).`);
  const parsedQty=rows.reduce((s,r)=>s+Math.abs(r.quantity),0),parsedValue=rows.reduce((s,r)=>s+Math.abs(r.movementValue),0);
  const byStore={};for(const r of rows){const s=byStore[r.store]||(byStore[r.store]={rows:0,start:r.date,end:r.date,qty:0,value:0});s.rows++;if(r.date<s.start)s.start=r.date;if(r.date>s.end)s.end=r.date;s.qty+=Math.abs(r.quantity);s.value+=Math.abs(r.movementValue);}
  const hasSummary=summaryLines>0,qtyDiff=hasSummary?parsedQty-summaryQty:null;
  const check={hasSummary,summaryQty,summaryValue,parsedQty,parsedValue,qtyDiff,ok:hasSummary?Math.abs(qtyDiff)<=Math.max(1,summaryQty*0.0005):null};
  if(hasSummary&&!check.ok)warnings.unshift(`A soma das quantidades (${parsedQty.toFixed(2)}) não bate com o resumo do PDF (${summaryQty.toFixed(2)}).`);
  return{rows,byStore,check,warnings:[...new Set(warnings)],opNames,products,balances,pages:pages.length};
}

async function readExtratoPdf(file,onProgress=()=>{}){
  if(typeof pdfjsLib==='undefined')throw new Error('O leitor de PDF não carregou. Verifique a internet e abra o sistema novamente.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];
  for(let n=1;n<=pdf.numPages;n++){const content=await (await pdf.getPage(n)).getTextContent();pages.push(content.items.map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width})));if(n===1||n%10===0||n===pdf.numPages)onProgress(n,pdf.numPages);}
  return parseExtratoPages(pages);
}
const api={parseExtratoPages,readExtratoPdf,ptNumber,groupLines};
if(typeof module!=='undefined')module.exports=api;else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
