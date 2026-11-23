(function(){
let s=3;const r=()=>{s=(s*9301+49297)%233280;return s/233280};
const fams={"DIA A DIA":["ALCATRA","PICANHA","CONTRA FILE","FRALDINHA","MAMINHA","COSTELA","CUPIM","PATINHO","ACEM","LINGUICA TOSCANA","CARNE MOIDA","MIOLO DA ALCATRA"],"FRANGO":["COXA E SOBRECOXA","PEITO DE FRANGO","ASA DE FRANGO","CORACAO","FILEZINHO"],"HAMBURGUER":["BURGER 150G","BURGER COSTELA","BURGER CHEDDAR","SMASH 90G"],"NABRASA/DUROC":["PANCETA DUROC","COPA LOMBO","PORK RIBS","TOMAHAWK SUINO"],"PAO DE ALHO":["PAO DE ALHO TRAD","PAO DE ALHO PICANTE","PAO DE ALHO QUEIJO"],"BEBIDAS":["COCA 2L","GUARANA 2L","CERVEJA LATA","AGUA 500ML","SUCO UVA 1L"],"MOLHOS COM SAIDA":["MOLHO CHIMICHURRI","MOLHO BARBECUE","MAIONESE DO REI","MOSTARDA E MEL"],"CONTAGEM RESF/CONG":["QUEIJO COALHO","LINGUICA CUIABANA","KAFTA","ESPETO MISTO"]};
const products=[];let c=100;
for(const [f,names] of Object.entries(fams))for(const n of names)for(const v of ['','KG ','PREMIUM '].slice(0,1+Math.floor(r()*2))){c++;const p={codigo_produto:String(c).padStart(6,'0'),produto:(v+n).trim(),familia:f};const cost=Math.round((8+r()*70)*100)/100;
for(const st of ['001','002','003']){const vend=Math.round(r()*180);p['estoque_atual_'+st]=Math.round((r()-0.12)*120);p['venda_periodo_'+st]=vend;p['compra_periodo_'+st]=Math.round(vend*(0.6+r()*0.7));p['custo_atual_'+st]=cost;p['preco_praticado_'+st]=Math.round(cost*(1.25+r()*0.6)*(r()>.85?1.08:1)*100)/100;}
products.push(p);}
const state={version:"2.6.0",products,period:{start:"2026-10-15",end:"2026-11-14"},meta:{sourceFile:"compras_out_nov.xlsx",validRows:products.length*3,ignoredRows:4,productCount:products.length,familyCount:8,familyConflicts:0,inferredFamilies:2,newProducts:3,importedAt:"2026-11-14T13:20:00Z",importedBy:"teste@reidogado.com.br"},hiddenProducts:[],syncUpdatedAt:1};
// Movimentações fictícias (formato v3 compacto) — out e nov/2026, 3 lojas.
const tree={compras_gerencial_v2:{state},compras_gerencial_v3:{operations:{},operationProducts:{},operationNames:{},operationsMeta:{imports:{},importedAt:'2026-11-22T12:00:00Z',importedBy:'teste@reidogado.com.br'}}};
const v3=tree.compras_gerencial_v3;
for(const p of products){p.unidade=['BEBIDAS','HAMBURGUER','PAO DE ALHO','MOLHOS COM SAIDA'].includes(p.familia)?'UN':'KG';v3.operationProducts[p.codigo_produto]=p.produto;}
for(const store of ['001','002','003'])for(const month of ['2026-10','2026-11']){const rows=[],last=month==='2026-11'?22:31;
 for(let day=1;day<=last;day+=1)for(const p of products){const kg=p.unidade==='KG',price=p['custo_atual_'+store]||20;
  if(r()<.5)rows.push([day,p.codigo_produto,'000003',kg?Math.round(r()*900)/100:Math.ceil(r()*6),price*1.4,0,'V'+day,0]);
  if(kg&&p.familia==='DIA A DIA'&&r()<.12)rows.push([day,p.codigo_produto,'000108',Math.round(r()*120)/100,price,0,'L'+day,0]);
  if(kg&&r()<.03)rows.push([day,p.codigo_produto,'000113',Math.round(r()*40)/100,price,0,'S'+day,0]);
  if(r()<.02)rows.push([day,p.codigo_produto,'000094',kg?Math.round(r()*600)/100:Math.ceil(r()*4),price,0,'I'+day,0]);
  if(r()<.015)rows.push([day,p.codigo_produto,'000097',kg?Math.round(r()*500)/100:Math.ceil(r()*3),price,0,'I'+day,0]);
  if(r()<.01)rows.push([day,p.codigo_produto,'000125',kg?Math.round(r()*200)/100:1,price,0,'E'+day,0]);
  if(day%7===1)rows.push([day,p.codigo_produto,'000143',kg?Math.round(r()*3000)/100:12,price,0,'NF'+day,0]);}
 for(const row of rows){row[4]=Math.round(row[4]*100)/100;row[5]=Math.round(row[3]*row[4]*100)/100;}
 (v3.operations[store]=v3.operations[store]||{})[month]={rows};
 const id=store+'_'+month.replace('-','')+'01';v3.operationsMeta.imports[id]={store,fileName:'extrato_ficticio.pdf',start:month+'-01',end:month+'-'+String(last).padStart(2,'0'),rows:rows.length,checkOk:true,importedAt:'2026-11-22T12:00:00Z',importedBy:'teste@reidogado.com.br'};}
// Firebase falso em memória: once/on/off/set/update/transaction por caminho.
const parts=path=>String(path||'').split('/').filter(Boolean);
const get=path=>parts(path).reduce((o,k)=>o==null?undefined:o[k],tree);
const put=(path,value)=>{const ks=parts(path),last=ks.pop();let o=tree;for(const k of ks){if(o[k]==null||typeof o[k]!=='object')o[k]={};o=o[k];}if(value==null)delete o[last];else o[last]=JSON.parse(JSON.stringify(value));};
const snap=path=>({val:()=>{const v=get(path);return v==null?null:JSON.parse(JSON.stringify(v));},exists:()=>get(path)!=null});
window.__fakeTree=tree;
const user={email:'teste@reidogado.com.br',uid:'u'};
const ref=(path='')=>({once:async()=>snap(path),on:(e,cb)=>{setTimeout(()=>cb(snap(path)),20);return cb},off(){},set:async v=>put(path,v),update:async u=>{for(const[k,v] of Object.entries(u))put(path+'/'+k,v);},transaction:async fn=>{const v=fn(get(path)==null?null:JSON.parse(JSON.stringify(get(path))));put(path,v);return{committed:true,snapshot:snap(path)};}});
const auth={currentUser:user,onAuthStateChanged:cb=>{setTimeout(()=>cb(user),10);return()=>{}},setPersistence:async()=>{},signInWithEmailAndPassword:async()=>({user}),signOut:async()=>{}};
const appo={auth:()=>auth,database:()=>({ref})};
window.firebase={apps:[],initializeApp(){this.apps.push(appo);return appo},app:()=>appo,auth:Object.assign(()=>auth,{Auth:{Persistence:{LOCAL:1,SESSION:2}}}),database:()=>({ref})};
})();
