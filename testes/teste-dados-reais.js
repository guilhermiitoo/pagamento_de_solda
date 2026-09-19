// Usa o banco de verdade do usuário + uma planilha do WH no formato descrito,
// e confere a análise OP por OP de ponta a ponta.
const fs=require('fs'),vm=require('vm');
const {carregar}=require('./harness.js');
const RAIZ=require('path').join(__dirname,'..');
const c=carregar(RAIZ+'/TPV_SolderControl_v11_0.html');
c.toast=()=>{};c.refreshView=()=>{};c.setSync=()=>{};

const real=JSON.parse(fs.readFileSync(RAIZ+'/ARQUIVO LIMPO 10-06 .json','utf8'));
c.__d=real; vm.runInContext('db=normalizarDB(window.__d)',c);
const db=vm.runInContext('db',c);
console.log('── Banco real do usuário ──');
console.log('  usuários: '+db.usuarios.length+' · histórico: '+db.historico.length+' registros · linhas: '+db.linhas.length);
console.log('  tipos de solda e peso do tubo:');
db.modelos.forEach(m=>console.log('     '+m.prefixo.padEnd(5)+(m.qtdGramas?m.qtdGramas+' g':'sem peso cadastrado → usa o padrão de 300 g')+(m.inativo?'  (inativo)':'')));

// OPs que realmente aparecem no histórico
const pagos=vm.runInContext('anPagosPorOP()',c);
const ops=Object.keys(pagos).slice(0,4);
console.log('\n── Simulação: planilha do WH cobrindo OPs reais do histórico ──');
console.log('  (peso escrito no formato da planilha, "1.101")');
const itens=ops.map((op,i)=>{
  const tubos=pagos[op].tubos, g=pagos[op].gramas;
  // pesos escolhidos para cair em cada situação
  const alvo=[g-1, g+g/tubos, g-g/(tubos*4), g/2][i]||g;
  const txt=Math.round(alvo).toLocaleString('pt-BR');       // "1.101"
  return {op,invoice:'INV'+i,qtdKit:'10',peso:c.anPeso(txt).g,pesoTxt:txt,reserva:'PL'+i};
});
db.planoWH={arquivo:'teste.xlsx',importadoEm:'hoje',por:'teste',ts:Date.now(),itens,cfg:{pesoTubo:300,tolPct:50}};

const linhas=vm.runInContext('anCalcular()',c).filter(l=>ops.includes(l.op));
console.log('');
console.log('  OP'.padEnd(12)+'planilha'.padEnd(12)+'tubo'.padEnd(8)+'previsto'.padEnd(10)+'pago'.padEnd(16)+'situação');
linhas.forEach(l=>{
  console.log('  '+l.op.padEnd(12)+(l.pesoTxt||l.peso+' g').padEnd(12)+(l.gTubo+'g').padEnd(8)+
    (l.prev+' tubo(s)').padEnd(10)+(l.tubos+' tubo(s) = '+l.gPago+'g').padEnd(16)+l.st);
});
const ruim=linhas.filter(l=>l.peso<=10);
console.log('\n  OPs lidas como 1 g ou menos: '+(ruim.length?ruim.map(x=>x.op).join(', ')+'  ← PROBLEMA':'nenhuma ✓'));
process.exit(ruim.length?1:0);
