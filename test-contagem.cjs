// Testa as contas da Contagem (contagem.js): leitura do número digitado, diferença e totais.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({app:{},num:v=>Number(v)||0,document:{}});
vm.runInContext(fs.readFileSync(__dirname+'/contagem.js','utf8'),ctx);
const parse=vm.runInContext('parseCountInput',ctx);
assert.equal(parse('12','un'),12);assert.equal(parse('3,6','un'),4,'unidade sempre inteira');assert.equal(parse('3,456','kg'),3.456);assert.equal(parse('1.234,5','kg'),1234.5);
assert.equal(parse('','kg'),null,'vazio = não contado');assert.equal(parse('abc','kg'),undefined,'texto inválido é recusado');
const c={items:{a:{name:'A',unit:'un',system:22,cost:28.5,counted:12},b:{name:'B',unit:'un',system:-2,cost:61.7,counted:4},c:{name:'C',unit:'kg',system:5,cost:40,counted:5.002},d:{name:'D',unit:'kg',system:3,cost:10,counted:null}}};
const st=vm.runInContext('countStats',ctx)(c);
assert.equal(st.total,4);assert.equal(st.counted,3);assert.equal(st.withDiff,2,'diferença de 2 g em kg não conta');
assert.equal(Math.round(st.out),285);assert.equal(Math.round(st.inn),370);
console.log('Contagem OK: número digitado (vírgula, milhar, unidade inteira), diferença e totais de falta e sobra.');
