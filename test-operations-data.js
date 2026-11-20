(function(){
let s=3;const r=()=>{s=(s*9301+49297)%233280;return s/233280};
const fams={"DIA A DIA":["ALCATRA","PICANHA","CONTRA FILE","FRALDINHA","MAMINHA","COSTELA","CUPIM","PATINHO","ACEM","LINGUICA TOSCANA","CARNE MOIDA","MIOLO DA ALCATRA"],"FRANGO":["COXA E SOBRECOXA","PEITO DE FRANGO","ASA DE FRANGO","CORACAO","FILEZINHO"],"HAMBURGUER":["BURGER 150G","BURGER COSTELA","BURGER CHEDDAR","SMASH 90G"],"NABRASA/DUROC":["PANCETA DUROC","COPA LOMBO","PORK RIBS","TOMAHAWK SUINO"],"PAO DE ALHO":["PAO DE ALHO TRAD","PAO DE ALHO PICANTE","PAO DE ALHO QUEIJO"],"BEBIDAS":["COCA 2L","GUARANA 2L","CERVEJA LATA","AGUA 500ML","SUCO UVA 1L"],"MOLHOS COM SAIDA":["MOLHO CHIMICHURRI","MOLHO BARBECUE","MAIONESE DO REI","MOSTARDA E MEL"],"CONTAGEM RESF/CONG":["QUEIJO COALHO","LINGUICA CUIABANA","KAFTA","ESPETO MISTO"]};
const products=[];let c=100;
for(const [f,names] of Object.entries(fams))for(const n of names)for(const v of ['','KG ','PREMIUM '].slice(0,1+Math.floor(r()*2))){c++;const p={codigo_produto:String(c).padStart(6,'0'),produto:(v+n).trim(),familia:f};const cost=Math.round((8+r()*70)*100)/100;
for(const st of ['001','002','003']){const vend=Math.round(r()*180);p['estoque_atual_'+st]=Math.round((r()-0.12)*120);p['venda_periodo_'+st]=vend;p['compra_periodo_'+st]=Math.round(vend*(0.6+r()*0.7));p['custo_atual_'+st]=cost;p['preco_praticado_'+st]=Math.round(cost*(1.25+r()*0.6)*(r()>.85?1.08:1)*100)/100;}
products.push(p);}
const state={version:"2.6.0",products,period:{start:"2026-10-15",end:"2026-11-14"},meta:{sourceFile:"compras_out_nov.xlsx",validRows:products.length*3,ignoredRows:4,productCount:products.length,familyCount:8,familyConflicts:0,inferredFamilies:2,newProducts:3,importedAt:"2026-11-14T13:20:00Z",importedBy:"teste@reidogado.com.br"},hiddenProducts:[],syncUpdatedAt:1};
state.operations=[];
for(const [i,p] of products.entries()){
 p.unidade=['BEBIDAS','HAMBURGUER','PAO DE ALHO'].includes(p.familia)?'UN':'KG';
 for(const store of ['001','002','003'])for(const [category,operation,code,q,price] of [['sale','VENDA','000003',50,40],['loss','LIMPEZA CARNE','000108',15,20],['loss','SAÍDA SANGUE','000113',1,20],['inventory','SAÍDA AJUSTE','000094',2,20]]){
  state.operations.push({store,date:'2026-11-10',productCode:p.codigo_produto,productName:p.produto,category,operation,operationCode:code,quantity:q,unitPrice:price,movementValue:q*price,document:String(i)});
 }
}
state.operationsMeta={imports:['001','002','003'].map(store=>({store,start:'2026-11-09',end:'2026-11-15'}))};
const user={email:'teste@reidogado.com.br',uid:'u'};
const ref=()=>({once:async()=>({val:()=>JSON.parse(JSON.stringify(state)),exists:()=>true}),on:(e,cb)=>{setTimeout(()=>cb({val:()=>JSON.parse(JSON.stringify(state)),exists:()=>true}),20);return cb},off(){},set:async()=>{}});
const auth={currentUser:user,onAuthStateChanged:cb=>{setTimeout(()=>cb(user),10);return()=>{}},setPersistence:async()=>{},signInWithEmailAndPassword:async()=>({user}),signOut:async()=>{}};
const appo={auth:()=>auth,database:()=>({ref})};
window.firebase={apps:[],initializeApp(){this.apps.push(appo);return appo},app:()=>appo,auth:Object.assign(()=>auth,{Auth:{Persistence:{LOCAL:1,SESSION:2}}}),database:()=>({ref})};
})();
