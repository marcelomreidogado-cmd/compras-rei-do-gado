// Testa o painel Produtos e preços v3 (prices.js) com um produto fictício.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/index.html','utf8');
const nodes={};const node=id=>nodes[id]||(nodes[id]={id,value:'',innerHTML:'',textContent:'',after(){},onchange:null});
const product={produto:'Teste',codigo_produto:'001',familia:'Carnes'};for(const s of ['001','002','003'])Object.assign(product,{['custo_atual_'+s]:5,['preco_praticado_'+s]:15,['venda_periodo_'+s]:10});
const ctx=vm.createContext({app:{products:[product],settings:{},operations:[]},document:{getElementById:node,querySelector:()=>({after(){}})},norm:s=>String(s).toLowerCase(),num:Number,STORE_IDS:['001','002','003'],STORES:{'001':'Coronel','002':'Correas','003':'Bingen'},STORE_COLORS:{},hiddenProductCodes:()=>new Set(),selectedPriceFamilies:new Set(),priceViewMode:'all',priceSort:{key:'name',dir:1},sameMoney:v=>new Set(v).size===1,esc:String,fmtCurrency:n=>n.toFixed(2),fmtMoney:n=>Math.round(n)+'',fmtQty:n=>String(n),fmtPct:n=>(n*100).toFixed(1)+'%',familyBadge:()=>'',visibilityButton:()=>'',priceStatusBadge:()=>'',empty:t=>t,saveState(){},queueCentralSave(){}});
for(const name of ['priceMargin','buildPriceRow','priceCell'])vm.runInContext(source.match(new RegExp('function '+name+'[^\\n]+'))[0],ctx);
vm.runInContext(fs.readFileSync(__dirname+'/prices.js','utf8'),ctx);
assert.equal(vm.runInContext('priceMarkup(5,15)',ctx),2);assert.equal(vm.runInContext('priceMargin(5,15)',ctx),2/3);assert.equal(vm.runInContext('priceMargin(0,15)',ctx),null);
vm.runInContext('renderPrices()',ctx);assert.ok(nodes.priceBody.innerHTML.includes('66.7%'));assert.ok(nodes.priceKpis.innerHTML.includes('66.7%'),'margem ponderada no topo');
vm.runInContext("setPriceDiagnostic('cost')",ctx);assert.ok(nodes.priceBody.innerHTML.includes('Nenhum produto'));
vm.runInContext("setPriceDiagnostic('cost')",ctx);assert.equal(vm.runInContext('priceDiagnostic',ctx),'all','clicar de novo limpa o filtro');
product.custo_atual_002=7;vm.runInContext("setPriceDiagnostic('cost')",ctx);assert.ok(nodes.priceBody.innerHTML.includes('Teste'));assert.ok(nodes.priceInsights.innerHTML.includes('Custo acima da loja mais barata'));
product.preco_praticado_002=4;vm.runInContext("setPriceDiagnostic('negative')",ctx);assert.ok(nodes.priceInsights.innerHTML.includes('Venda abaixo do custo'));assert.ok(nodes.priceInsights.innerHTML.includes('30.00'),'impacto 10 × (7−4)');
product.preco_praticado_002=8;vm.runInContext("setPriceDiagnostic('low')",ctx);assert.ok(nodes.priceInsights.innerHTML.includes('preço sugerido 10.00'),'7 ÷ (1 − 30%)');
console.log('Preços OK: margem e markup, filtros clicáveis, custo diferente, abaixo do custo e preço para a meta.');
