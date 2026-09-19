// Simula DUAS máquinas gravando no MESMO arquivo JSON de uma pasta de rede,
// reproduzindo o comportamento do Windows/SMB que entrega a data do arquivo
// desatualizada. É o cenário do "pedido não aparece em alguns computadores".
const vm=require('vm');
const {carregar}=require('./harness.js');
const RAIZ=require('path').join(__dirname,'..');
const HTML=process.argv[2]||RAIZ+'/TPV_SolderControl_v11_0.html';

// ── O "arquivo na rede" ──
function novaRede({dataMentirosa}){
  return {
    texto:'', mtimeReal:1000, mtimeVisivel:1000,
    escrever(t){this.texto=t;this.mtimeReal+=1000;
      // SMB com cache: a data que as OUTRAS máquinas enxergam não muda
      if(!dataMentirosa)this.mtimeVisivel=this.mtimeReal;},
  };
}
function handleDe(rede){
  return {async getFile(){return{
    lastModified:rede.mtimeVisivel, size:Buffer.byteLength(rede.texto),
    async text(){return rede.texto;}};},
    async createWritable(){let buf='';return{async write(t){buf=t;},async close(){rede.escrever(buf);}};}};
}

function maquina(rede,nome){
  const c=carregar(HTML);
  c.toast=()=>{};c.refreshView=()=>{};c.setSync=()=>{};c._bancoAtualizarData=()=>{};
  const run=src=>vm.runInContext(src,c);
  run('dbHandle=null');
  c.__h=handleDe(rede);
  run('dbHandle=window.__h');
  c.__nome=nome;
  return {c,run,
    adotar(obj){this.c.__o=obj;this.run('DB.adotar(window.__o,'+rede.mtimeVisivel+',JSON.stringify(window.__o),'+Buffer.byteLength(rede.texto)+')');},
    push(){return this.run('DB.push()');},
    pull(){return this.run('DB.pull(true)');},
    db(){return this.run('db');}};
}

async function cenario(dataMentirosa){
  const rede=novaRede({dataMentirosa});
  const inicial={_v:4,_sistema:'TPV_SolderControl',modelos:[{prefixo:'TTO',qtdGramas:600}],linhas:['SMT 01'],
    usuarios:[{nome:'Admin',login:'admin',senha:'x',setor:'MMT'}],estoque:{},historico:[],cTubo:{},emUso:{},
    fifoSeq:{},correcoes:[],limpezas:[],solicitacoes:[]};
  rede.texto=JSON.stringify(inicial);rede.mtimeReal=rede.mtimeVisivel=1000;

  const A=maquina(rede,'A'), B=maquina(rede,'B');
  A.adotar(JSON.parse(rede.texto)); B.adotar(JSON.parse(rede.texto));

  // Líder da linha 1, na máquina A, solicita solda
  A.db().solicitacoes.push({id:'s-A',ts:1,data:'01/01/2026',hora:'08:00',status:'PENDENTE',lider:'Líder A',linha:'SMT 01',op:'1144767',modelo:'TTO',qty:1});
  await A.push();

  // Ao mesmo tempo, o MMT na máquina B registra outra coisa e salva
  B.db().historico.push({id:'h-B',ts:2,data:'01/01/2026',hora:'08:01',lpn:'LPN-B',tipo:'SAIDA',op:'999',modelo:'TTO',linha:'SMT 01'});
  await B.push();

  const fim=JSON.parse(rede.texto);
  return {
    pedidoA:(fim.solicitacoes||[]).some(x=>x.id==='s-A'),
    registroB:(fim.historico||[]).some(x=>x.id==='h-B')};
}

(async()=>{
  let fail=0;
  for(const mentira of [false,true]){
    const r=await cenario(mentira);
    const titulo=mentira?'rede com data desatualizada (SMB/Windows)':'rede com data correta';
    const bom=r.pedidoA&&r.registroB;
    console.log('\n── '+titulo+' ──');
    console.log('  solicitação da máquina A sobreviveu : '+(r.pedidoA?'SIM':'NÃO  ← pedido sumiu'));
    console.log('  registro da máquina B sobreviveu    : '+(r.registroB?'SIM':'NÃO  ← registro sumiu'));
    console.log('  '+(bom?'ok':'FALHA'));
    if(!bom)fail++;
  }
  console.log('\n'+(fail?fail+' cenário(s) com perda de dado':'nenhum dado perdido nos 2 cenários'));
  process.exit(fail?1:0);
})();
