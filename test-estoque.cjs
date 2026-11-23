// Testa unidades (kg/un), arredondamento de itens por unidade e a análise de estoque por loja (estoque.js).
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const ctx=vm.createContext({app:{settings:{coverageDays:7},unitCatalog:{},products:[]},STORE_IDS:['001','002','003'],STORES:{'001':'Coronel','002':'Correas','003':'Bingen'},Intl,document:{readyState:'complete',getElementById:()=>null}});
for(const name of ['norm','num','normalizeMeasureUnit','cleanProductCode'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],ctx);
vm.runInContext(fs.readFileSync(__dirname+'/estoque.js','utf8'),ctx);ctx.periodDays=()=>10;
const u=(produto,familia='DIA A DIA',codigo_produto='1')=>vm.runInContext('productMeasureUnit',ctx)({produto,familia,codigo_produto});
assert.equal(u('CERVEJA HEINEKEN ULTIMATE 330ML','BEBIDAS'),'un');assert.equal(u('NABRASA PERNIL PACOTE 0,700G','NABRASA/DUROC'),'un');
assert.equal(u('PATINHO PECA'),'kg');assert.equal(u('NABRASA PERNIL KG','NABRASA/DUROC'),'kg');assert.equal(u('MOLHO CHIMICHURRI','MOLHOS COM SAIDA'),'un');
ctx.app.unitCatalog['000009']='un';assert.equal(u('PAO BRIOCHE','HAMBURGUER','9'),'un','cadastro manual vence');
const beer={produto:'CERVEJA HEINEKEN ULTIMATE 330ML',familia:'BEBIDAS',codigo_produto:'900154',estoque_atual_001:45.51,venda_periodo_001:5.4,compra_periodo_001:45.51,estoque_atual_002:2,venda_periodo_002:0,estoque_atual_003:0,venda_periodo_003:0};
vm.runInContext('normalizeUnitQuantities',ctx)([beer]);assert.equal(beer.estoque_atual_001,46);assert.equal(beer.venda_periodo_001,5);
const meat={produto:'ALCATRA',familia:'DIA A DIA',codigo_produto:'2',estoque_atual_001:1.234,venda_periodo_001:30,estoque_atual_002:40,venda_periodo_002:10,estoque_atual_003:-1,venda_periodo_003:5};
vm.runInContext('normalizeUnitQuantities',ctx)([meat]);assert.equal(meat.estoque_atual_001,1.234,'kg não arredonda');
const r=vm.runInContext('stockRow',ctx)(meat);
assert.equal(r.stores['001'].status,'low');assert.equal(r.stores['003'].status,'negative');assert.equal(r.stores['002'].status,'excess');
assert.ok(r.transfers.some(t=>t.from==='002'&&t.to==='001'&&t.q>0),'sugere Correas → Coronel');
console.log('Estoque OK: unidades por nome/família/cadastro, itens por unidade inteiros, situação por loja e transferência.');
