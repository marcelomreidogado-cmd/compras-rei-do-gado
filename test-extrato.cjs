// Testa o leitor do extrato (extrato.js) com páginas FICTÍCIAS no mesmo layout do Alterdata.
const assert=require('node:assert/strict');const{parseExtratoPages}=require('./extrato.js');
const it=(s,x,y,right)=>({s,x,y,w:right?right-x:s.length*5});
const head=(store,n)=>[it('FILIAL '+store,496,800,567),it('Extrato de Produtos - Com Saldo e Resumo por Operação',30,790),it('Página '+n,520,757),it('Empresa',30,726),it({CORONEL:'001',CORREAS:'002',BINGEN:'003'}[store],80,726)];
const mov=(y,date,op,name,doc,q,pu,v)=>[it(date,27.8,y,68),it(op,75,y,102),it(name,111.8,y,190),it(doc,400,y+1,434),...(q!=null?[it(q,443,y,464)]:[]),it(pu,490,y,511),it(v,535,y,567)];
const prod=(y,code,name)=>[it(code,29.3,y,56),it(name,152.3,y,275)];
const pages=[
 [...head('CORONEL',1),...prod(677,'000221','PATINHO PECA'),it('Saldo Inicial',364,661,411),it('40',454,661,464),...mov(648,'03/11/2026','000108','LIMPEZA CARNE DIA A DIA','900001','2,50','40,00','100,00'),...mov(637,'04/11/2026','000097','ENTRADA AJUSTE INVENTARIO','900002','10,00','40,00','400,00'),...mov(626,'04/11/2026','000097','ENTRADA AJUSTE INVENTARIO','900002','10,00','40,00','400,00')],
 [...head('CORREAS',2),...prod(677,'7792798007547','CERVEJA LONG'),...mov(648,'05/11/2026','000143','COMPRA DENTRO DO ESTADO','56456',null,'10,00','120,00'),...mov(637,'06/11/2026','000116','VENDA DE MERCADORIA','000066573','1,00','8,99','8,99')],
 [...head('BINGEN',3),...prod(677,'000065','FRANGO PEITO'),...mov(648,'07/11/2026','000094','SAIDA AJUSTE INVENTARIO','900010','1.234,567','15,00','18.518,51'),
  it('Resumo por operação',26,600),it('Quantidade',271,580,331),it('Valor',402,580,430),it('ENTRADA AJUSTE INVENTARIO',46,560),it('20,00',298,560,331),it('800,00',387,560,430),it('OUTRAS',46,540),it('1.250,567',290,540,331),it('18.747,50',375,540,430),it('Filtros Utilizados:',30,400)]
];
const r=parseExtratoPages(pages);
assert.equal(r.rows.length,6,'linhas repetidas legítimas não são descartadas');
assert.deepEqual(Object.keys(r.byStore).sort(),['001','002','003'],'cada página com sua loja');
assert.equal(r.byStore['002'].rows,2);assert.equal(r.rows.find(x=>x.productCode==='7792798007547').quantity,12,'quantidade calculada por valor ÷ preço');
assert.ok(r.rows.find(x=>x.productCode==='7792798007547').qtyDerived);
assert.equal(r.rows.find(x=>x.store==='003').quantity,1234.567,'milhar e decimais');
assert.equal(r.rows[0].document,'900001');assert.equal(r.balances['001|000221'].start,40);
assert.equal(r.check.ok,true,'quantidades conferem com o resumo');assert.equal(r.check.summaryQty,1270.567);
pages[0].splice(pages[0].findIndex(i=>i.s==='400,00'),1);const bad=parseExtratoPages(pages);assert.equal(bad.check.ok,false);assert.ok(bad.warnings.some(w=>/sem valor/.test(w)));
console.log('Extrato OK: 3 lojas no mesmo PDF, EAN, quantidade calculada, repetidas mantidas, conferência com o resumo.');
