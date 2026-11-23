/* Camada de gravação v3 (23/11/2026).
   Antes: a base inteira (produtos + todas as movimentações) era regravada numa única transação a cada clique,
   o Firebase desistia ("maxretry") e a alteração ficava só no computador.
   Agora cada parte tem seu lugar e cada clique grava só o item alterado:
     compras_gerencial_v3/core                         produtos, famílias, período, parâmetros (pequeno)
     compras_gerencial_v3/hiddenProducts/<p+código>    produto oculto
     compras_gerencial_v3/productFollowups/...         marcação "comprado" e observações (product-notes.js)
     compras_gerencial_v3/unitCatalog/<código>         unidade kg/un
     compras_gerencial_v3/previousImport               base anterior, para "Desfazer importação"
     compras_gerencial_v3/operations/<loja>/<AAAA-MM>  movimentações do extrato, compactas
     compras_gerencial_v3/operationProducts|operationNames|operationsMeta
   A base antiga (compras_gerencial_v2/state) NÃO é alterada: fica como backup. */
const DB_ROOT='compras_gerencial_v3';
const LEGACY_PATH='compras_gerencial_v2/state';
const LOCAL_KEY='rdg_compras_gerencial_v3';
let dbListeners=[],lastApplied={},opsLoadedFor=null,opsPromise=Promise.resolve(),renderTimer=null;
const dbRef=path=>fbDB.ref(DB_ROOT+(path?'/'+path:''));
const fbKey=code=>'p'+encodeURIComponent(String(code)).replace(/\./g,'%2E');
const cleanJson=value=>JSON.parse(JSON.stringify(value??null));
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{setFamilyOptions();updateSourceBar();updateUndoButton();renderAll();},60);}

/* Cópia local só do que é leve: as movimentações vêm sempre da base central. */
function saveState(){try{const{operations,previousImport,...light}=app;localStorage.setItem(LOCAL_KEY,JSON.stringify(light));}catch(error){console.warn('Cópia local não salva',error);}}
function loadState(){
  try{localStorage.removeItem('rdg_compras_gerencial_v2');}catch(e){}
  try{const saved=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');if(saved&&Array.isArray(saved.products))return normalizeState({...saved,operations:[]});}catch(error){}
  return normalizeState(INITIAL_DATA);
}
function coreFromState(state){return cleanJson({products:state.products||[],meta:state.meta||{},familyMap:state.familyMap||{},period:state.period||{},settings:state.settings||{},previousImportAt:state.previousImport?.savedAt||state.previousImportAt||'',version:VERSION,syncUpdatedAt:new Date().toISOString(),syncUpdatedBy:currentUser?.email||'Usuário'});}

/* ---------- movimentações compactas ---------- */
function compactOperations(rows){return rows.map(r=>[Number(r.date.slice(8,10)),r.productCode,r.operationCode,r.quantity,Math.round((r.unitPrice||0)*10000)/10000,r.movementValue,r.document||'',r.qtyDerived?1:0]);}
function expandOperations(tree,names,opNames){
  const rows=[];
  for(const[store,months]of Object.entries(tree||{}))for(const[month,block]of Object.entries(months||{}))for(const r of block?.rows||[]){
    const[day,code,op,qty,price,value,doc,derived]=r,operation=OPERATION_NAMES[op]||opNames?.[op]||`OPERAÇÃO ${op}`;
    rows.push({date:`${month}-${String(day).padStart(2,'0')}`,store,productCode:code,productName:names?.[code]||app.products.find(p=>p.codigo_produto===code)?.produto||code,operationCode:op,operation,category:operationCategory(op,opNames?.[op]||operation),quantity:+qty||0,unitPrice:+price||0,movementValue:+value||0,document:doc||'',qtyDerived:!!derived});
  }
  operationUnitCache.clear();for(const r of rows)if(operationMeasureUnit(r)==='un'&&Math.abs(r.quantity%1)>1e-9){r.quantity=Math.round(r.quantity)||Math.sign(r.quantity);r.unitRounded=true;}
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.productName.localeCompare(b.productName,'pt-BR'));
}
async function loadOperations(force=false){
  const key=app.operationsMeta?.importedAt||'';if(!force&&opsLoadedFor===key)return;opsLoadedFor=key;
  opsPromise=(async()=>{
    const[tree,names,opNames]=await Promise.all(['operations','operationProducts','operationNames'].map(p=>dbRef(p).once('value').then(s=>s.val())));
    app.operations=expandOperations(tree,names,opNames);app.operationNames=opNames||{};operationUnitCache.clear();
    if(typeof renderOperations==='function')renderOperations();
  })();
  return opsPromise;
}
function monthsBetween(start,end){const out=[];let[y,m]=start.slice(0,7).split('-').map(Number);const[ey,em]=end.slice(0,7).split('-').map(Number);while(y<ey||(y===ey&&m<=em)){out.push(`${y}-${String(m).padStart(2,'0')}`);m++;if(m>12){m=1;y++;}}return out;}
/* Grava um extrato: para cada loja do PDF, substitui só os dias do período lido. */
async function saveOperationsImport(parsed,fileName){
  await opsPromise;
  const updates={},importedAt=new Date().toISOString(),importedBy=currentUser?.email||'Usuário';let current=[...app.operations];
  for(const[store,info]of Object.entries(parsed.byStore)){
    current=current.filter(r=>!(r.store===store&&r.date>=info.start&&r.date<=info.end));
    const incoming=parsed.rows.filter(r=>r.store===store);
    for(const month of monthsBetween(info.start,info.end)){
      const monthRows=[...current.filter(r=>r.store===store&&r.date.startsWith(month)),...incoming.filter(r=>r.date.startsWith(month))].sort((a,b)=>a.date.localeCompare(b.date));
      updates[`operations/${store}/${month}`]=monthRows.length?{rows:compactOperations(monthRows),updatedAt:importedAt}:null;
    }
    for(const[oldId,e]of Object.entries(app.operationsMeta?.importsById||{}))if(e.store===store&&e.start>=info.start&&e.end<=info.end)updates[`operationsMeta/imports/${oldId}`]=null;
    const id=`${store}_${info.start}_${info.end}`.replace(/-/g,'');
    updates[`operationsMeta/imports/${id}`]={store,fileName,start:info.start,end:info.end,rows:info.rows,qty:+info.qty.toFixed(3),value:+info.value.toFixed(2),checkOk:parsed.check.ok,importedAt,importedBy};
    current.push(...incoming);
  }
  for(const[code,name]of Object.entries(parsed.products))updates[`operationProducts/${code}`]=name;
  for(const[op,name]of Object.entries(parsed.opNames))updates[`operationNames/${op}`]=name;
  updates['operationsMeta/importedAt']=importedAt;updates['operationsMeta/importedBy']=importedBy;
  setSyncStatus('Salvando extrato','busy');
  await dbRef().update(cleanJson(updates));
  await refreshOperationsMeta();
  setSyncStatus('Sincronizado','ok');
  return{importedAt,stores:Object.keys(parsed.byStore)};
}
async function removeOperationsImport(id){
  const entry=(app.operationsMeta?.importsById||{})[id];if(!entry)return;await opsPromise;
  const updates={[`operationsMeta/imports/${id}`]:null,'operationsMeta/importedAt':new Date().toISOString()};
  for(const month of monthsBetween(entry.start,entry.end)){const keep=app.operations.filter(r=>r.store===entry.store&&r.date.startsWith(month)&&!(r.date>=entry.start&&r.date<=entry.end));updates[`operations/${entry.store}/${month}`]=keep.length?{rows:compactOperations(keep),updatedAt:new Date().toISOString()}:null;}
  await dbRef().update(cleanJson(updates));
  await refreshOperationsMeta();
}
async function refreshOperationsMeta(){const v=(await dbRef('operationsMeta').once('value')).val();lastApplied.operationsMeta=JSON.stringify(v??null);NODE_APPLY.operationsMeta(v);await opsPromise;}

/* ---------- migração da base v2 (somente leitura da antiga) ---------- */
async function migrateLegacy(){
  const legacy=(await fbDB.ref(LEGACY_PATH).once('value')).val();
  if(!legacy||!Array.isArray(legacy.products))return false;
  const s=normalizeState(legacy),updates={
    core:coreFromState(s),
    hiddenProducts:Object.fromEntries((s.hiddenProducts||[]).map(code=>[fbKey(code),String(code)])),
    productFollowups:legacy.productFollowups||null,unitCatalog:legacy.unitCatalog||null,
    previousImport:legacy.previousImport?.products?.length?{products:legacy.previousImport.products,meta:legacy.previousImport.meta||{},familyMap:legacy.previousImport.familyMap||{},savedAt:legacy.previousImport.savedAt||''}:null,
    migratedFrom:{path:LEGACY_PATH,at:new Date().toISOString(),by:currentUser?.email||'',note:'Base v2 preservada sem alterações como backup.'}
  };
  await dbRef().update(cleanJson(updates));
  return true;
}

/* ---------- carregar e acompanhar ---------- */
const NODE_APPLY={
  core(v){if(!v)return;app.settings={coverageDays:7,safetyDays:2,roundMode:'precise',...(v.settings||{})};app.products=normalizeUnitQuantities(Array.isArray(v.products)?v.products:[]);operationUnitCache.clear();app.meta={...clone(INITIAL_DATA.meta),...(v.meta||{})};app.familyMap=v.familyMap||{};app.period={start:'',end:'',...(v.period||{})};app.settings={coverageDays:7,safetyDays:2,roundMode:'precise',...(v.settings||{})};app.previousImportAt=v.previousImportAt||'';app.syncUpdatedAt=v.syncUpdatedAt||'';},
  hiddenProducts(v){app.hiddenProducts=Object.values(v||{}).map(String);},
  productFollowups(v){app.productFollowups=v||{};},
  unitCatalog(v){app.unitCatalog=v||{};operationUnitCache.clear();},
  previousImport(v){app.previousImport=v&&Array.isArray(v.products)?v:null;},
  operationsMeta(v){const byId=v?.imports||{},imports=Object.entries(byId).map(([id,e])=>({id,...e})).sort((a,b)=>(b.importedAt||'').localeCompare(a.importedAt||''));app.operationsMeta={imports,importsById:byId,importedAt:v?.importedAt||'',importedBy:v?.importedBy||''};loadOperations().catch(error=>showToast('Não foi possível carregar as movimentações',firebaseErrorMessage(error),'error'));}
};
async function loadCentralState(){
  if(!fbDB||!currentUser)throw new Error('Usuário não autenticado.');
  setSyncStatus('Carregando base central','busy');
  let core=(await dbRef('core').once('value')).val();
  if(!core){setSyncStatus('Atualizando a base para a nova versão','busy');if(await migrateLegacy()){core=(await dbRef('core').once('value')).val();showToast('Base atualizada para a versão 3','A base antiga continua guardada como backup.');}}
  const nodes=Object.keys(NODE_APPLY).filter(n=>n!=='core'),values=await Promise.all(nodes.map(n=>dbRef(n).once('value').then(s=>s.val())));
  NODE_APPLY.core(core);nodes.forEach((n,i)=>{if(n!=='operationsMeta')NODE_APPLY[n](values[i]);lastApplied[n]=JSON.stringify(values[i]??null);});lastApplied.core=JSON.stringify(core??null);
  NODE_APPLY.operationsMeta(values[nodes.indexOf('operationsMeta')]);
  saveState();scheduleRender();
  setSyncStatus(core?'Sincronizado':'Base central vazia',core?'ok':'busy');
  if(!core)showToast('Base central pronta','Faça uma importação neste ou em outro computador para publicar a primeira base.');
}
function startRemoteListener(){
  stopRemoteListener();
  for(const node of Object.keys(NODE_APPLY)){
    const ref=dbRef(node),handler=snapshot=>{const v=snapshot.val(),json=JSON.stringify(v??null);if(lastApplied[node]===json)return;lastApplied[node]=json;NODE_APPLY[node](v);saveState();scheduleRender();setSyncStatus('Sincronizado','ok');};
    ref.on('value',handler,error=>{setSyncStatus('Erro de sincronização','error');console.error(error);});dbListeners.push([ref,handler]);
  }
}
function stopRemoteListener(){for(const[ref,handler]of dbListeners)ref.off('value',handler);dbListeners=[];}

/* ---------- gravações pequenas ---------- */
async function saveCentralState(reason='update'){
  if(!fbDB||!currentUser)throw new Error('Entre novamente para salvar na base central.');
  setSyncStatus('Salvando','busy');
  const core=coreFromState(app);
  if(reason==='import'){core.meta={...core.meta,importedBy:currentUser.email||'Usuário'};}
  if(reason==='import'||reason==='import_restore'){await dbRef().update(cleanJson({core,previousImport:app.previousImport||null}));lastApplied.previousImport=JSON.stringify(cleanJson(app.previousImport||null));}
  else await dbRef('core').set(core);
  lastApplied.core=JSON.stringify(core);saveState();updateSourceBar();setSyncStatus('Sincronizado','ok');return true;
}
function queueCentralSave(reason='update'){if(!syncReady||!currentUser)return;clearTimeout(centralSaveTimer);centralSaveTimer=setTimeout(()=>saveCentralState(reason).catch(error=>{setSyncStatus('Erro ao salvar','error');showToast('Alteração não foi salva na base central',firebaseErrorMessage(error),'error');}),500);}
async function setProductHidden(code,hide){
  if(!syncReady||!currentUser)throw new Error('Aguarde a conexão com a base central.');
  setSyncStatus('Salvando','busy');await dbRef('hiddenProducts/'+fbKey(code)).set(hide?String(code):null);setSyncStatus('Sincronizado','ok');
}
/* Backup completo em arquivo (botão "Baixar backup"). */
async function downloadBackup(){
  try{const snapshot=await dbRef().once('value'),blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),path:DB_ROOT,data:snapshot.val()})],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`backup-compras-rei-do-gado-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);showToast('Backup baixado','Guarde o arquivo em local seguro.');}
  catch(error){showToast('Não foi possível gerar o backup',firebaseErrorMessage(error),'error');}
}
