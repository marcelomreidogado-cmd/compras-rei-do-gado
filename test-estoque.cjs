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

// Carregar a base: unidade definida à mão (kg) tem de valer antes de arredondar os produtos do core.
{const vals={core:{products:[{produto:'PAO DE ALHO TRADICIONAL',familia:'PAO DE ALHO',codigo_produto:'000077',estoque_atual_001:3.75}],settings:{}},unitCatalog:{'000077':'kg'}};
 Object.assign(ctx,{fbDB:{ref:path=>({once:async()=>({val:()=>vals[path.split('/')[1]]??null})})},currentUser:{email:'teste'},operationUnitCache:new Map(),INITIAL_DATA:{meta:{}},clone:x=>JSON.parse(JSON.stringify(x)),setSyncStatus(){},showToast(){},localStorage:{setItem(){},getItem(){return null},removeItem(){}},setTimeout:()=>0,clearTimeout(){},Promise,console});
 vm.runInContext(fs.readFileSync(__dirname+'/store.js','utf8').replace(/^const /gm,'var ').replace(/^let /gm,'var '),ctx);
 ctx.loadOperations=async()=>{};ctx.app.operationsMeta={};
 vm.runInContext('NODE_APPLY.operationsMeta=()=>{}',ctx);
 vm.runInContext('loadCentralState()',ctx).then(()=>{assert.equal(ctx.app.products[0].estoque_atual_001,3.75,'produto marcado como kg não é arredondado ao carregar');console.log('Carregamento OK: unidade definida à mão vale antes do arredondamento.');}).catch(e=>{console.error(e);process.exit(1);});}
