// TESTE DE REDE v13 — Simulador: vários "PCs" (contextos isolados) gravando na mesma pasta em memória.
const vm=require('vm'),fs=require('fs');
// uso: node teste-pasta.js [banco.json] [html]    LAT=40 node teste-pasta.js ...  (latência por operação, ms)
const HTML=process.argv[3]||__dirname+'/../TPV_SolderControl_v13_3.html';
const APP=fs.readFileSync(HTML,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const rnd=(a,b)=>a+Math.random()*(b-a);
const LAT=+process.env.LAT||3;   // latência média (ms) de cada operação de arquivo
const espera=()=>new Promise(r=>setTimeout(r,rnd(0,LAT*2)));

// ---------- pasta em memória (imita a File System Access API) ----------
class FFile{constructor(buf,mt){this._b=buf;this.size=buf.length;this.lastModified=mt;}
  async text(){await espera();return this._b.toString('utf8');}
  slice(a){const b=this._b.subarray(a||0);return{text:async()=>{await espera();return b.toString('utf8');}};}}
class FH{constructor(dir,name){this.kind='file';this.name=name;this.dir=dir;}
  async getFile(){await espera();const f=this.dir.files.get(this.name);if(!f){const e=new Error('nf');e.name='NotFoundError';throw e;}return new FFile(f.b,f.mt);}
  async createWritable(o){await espera();const cur=this.dir.files.get(this.name);let buf=(o&&o.keepExistingData&&cur)?Buffer.from(cur.b):Buffer.alloc(0),pos=0;const self=this;
    return{async seek(p){pos=p;},async write(t){const d=Buffer.from(t,'utf8');const nb=Buffer.alloc(Math.max(buf.length,pos+d.length));buf.copy(nb);d.copy(nb,pos);buf=nb;pos+=d.length;},
      async close(){await espera();self.dir.files.set(self.name,{b:buf,mt:Date.now()});}};}}
class DH{constructor(name){this.kind='directory';this.name=name;this.files=new Map();this.dirs=new Map();}
  async getFileHandle(n,o){await espera();if(!this.files.has(n)){if(!(o&&o.create)){const e=new Error('nf');e.name='NotFoundError';throw e;}this.files.set(n,{b:Buffer.alloc(0),mt:Date.now()});}return new FH(this,n);}
  async getDirectoryHandle(n,o){await espera();if(!this.dirs.has(n)){if(!(o&&o.create)){const e=new Error('nf');e.name='NotFoundError';throw e;}this.dirs.set(n,new DH(n));}return this.dirs.get(n);}
  async removeEntry(n){await espera();if(!this.files.delete(n)&&!this.dirs.delete(n)){const e=new Error('nf');e.name='NotFoundError';throw e;}}
  async *entries(){for(const [n] of this.files)yield [n,new FH(this,n)];for(const [n,d] of this.dirs)yield [n,d];}
  async queryPermission(){return 'granted';}async requestPermission(){return 'granted';}}

// ---------- um PC ----------
function novoPC(nome){
  const el=()=>new Proxy({style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},value:'',textContent:'',innerHTML:'',checked:false,
    addEventListener(){},focus(){},select(){},appendChild(){},remove(){},querySelector(){return el();},querySelectorAll(){return [];},getContext(){return new Proxy({},{get:()=>()=>{}});}},
    {get:(t,k)=>k in t?t[k]:(typeof k==='string'?undefined:undefined),set:(t,k,v)=>{t[k]=v;return true;}});
  const ls={};
  const toasts=[];
  const ctx={console:{log(){},warn(){},error(){},info(){}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},TextEncoder,Promise,JSON,Math,Date,Map,Set,Buffer,
    localStorage:{getItem:k=>ls[k]||null,setItem:(k,v)=>{ls[k]=String(v);},removeItem:k=>{delete ls[k];}},
    document:{getElementById:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener(){},body:el(),hidden:false,documentElement:el()},
    navigator:{clipboard:{writeText:async()=>{}}},location:{href:'file:///x.html',protocol:'file:'},alert(){},confirm:()=>true,
    indexedDB:null,performance:{now:()=>Date.now()}};
  ctx.window=ctx;ctx.self=ctx;ctx.addEventListener=()=>{};
  vm.createContext(ctx);
  ls['tpv_solda_pc_id']=nome;
  vm.runInContext(APP+`
    ;globalThis.__=()=>({PASTA,DB,get db(){return db},set db(v){db=v},set dbHandle(v){dbHandle=v},set cu(v){cu=v},normalizarDB,_concluirConexao,filaLivre,agora,novoId,save});
    toast=(m,t)=>__toasts.push([t,m]);refreshView=()=>{};setSync=()=>{};`,ctx);
  ctx.__toasts=toasts;
  const api=ctx.__();api.toasts=toasts;api.nome=nome;
  return api;
}
async function conectar(pc,raiz){
  await pc.PASTA.abrirHandles(raiz);
  const d=await pc.PASTA.carregar();pc.dbHandle=raiz;pc.DB.adotar(d);
}
// cópia exata do fluxo de confirmarReq (sem a tela)
async function solicitar(pc,lider,mod,qty){
  pc.cu={nome:lider,login:lider};
  await pc.DB.pullNow();
  const db=pc.db,livres=pc.filaLivre(mod);if(!livres.length)return null;
  const reservados=livres.slice(0,Math.min(qty,livres.length)).map(it=>({lpn:it.lpn,fifo:it.fifo}));
  const ag=pc.agora(),id=pc.novoId('s');
  db.solicitacoes.push({id,ts:ag.ts,data:ag.data,hora:ag.hora,status:'PENDENTE',lider,loginLider:lider,linha:'SMT 01',op:'1',modelo:mod,qty:reservados.length,reservados});
  reservados.forEach(r=>db.historico.push({id:pc.novoId(),ts:ag.ts,tubo:r.fifo,lpn:r.lpn,linha:'SMT 01',lider,data:ag.data,hora:ag.hora,op:'1',modelo:mod,tipo:'SOLICITACAO',solicitacaoId:id}));
  await pc.save();
  for(let i=0;i<3000&&(pc.DB.writing||pc.DB.pending);i++)await new Promise(r=>setTimeout(r,20));
  return id;
}
const ok=(c,m)=>{console.log((c?'  ✅ ':'  ❌ ')+m);if(!c)process.exitCode=1;};
const resumo=d=>JSON.stringify({e:d.estoque,u:d.emUso,s:d.solicitacoes,h:d.historico.map(h=>[h.id,h.lpn,h.tipo,h.obs||'']).sort()});

(async()=>{
  const banco=JSON.parse(fs.readFileSync(process.argv[2]||__dirname+'/../ARQUIVO LIMPO 10-06 .json','utf8'));
  const raiz=new DH('01 - SISTEMA DE REQUISIÇÃO DE SOLDA');
  console.log('1) Migração do JSON real');
  const A=novoPC('PC-A');
  const put=(nome,txt)=>raiz.files.set(nome,{b:Buffer.from(txt,'utf8'),mt:Date.now()});
  put('BANCO_SOLDA.json',JSON.stringify(banco));
  ok(await A._concluirConexao(raiz)===false&&!raiz.dirs.has('dados'),'pasta sem SOLDA_PASTA_DO_SISTEMA.json: recusada, nada criado');
  put('SOLDA_PASTA_DO_SISTEMA.json','{"sistema":"SOLDA_MMT"}');
  ok(await A._concluirConexao(raiz)===true,'com a confirmação: JSON antigo convertido e banco aberto');
  ok(A.db.historico.length===banco.historico.length,'histórico migrado: '+A.db.historico.length+' de '+banco.historico.length);
  ok(A.db.solicitacoes.length===banco.solicitacoes.length&&A.db.usuarios.length===banco.usuarios.length,'solicitações e usuários iguais');
  ok(JSON.stringify(A.db.estoque)===JSON.stringify(banco.estoque),'estoque idêntico');
  ok([...raiz.files.keys()].some(k=>/^BANCO_SOLDA_MIGRADO_.*\.bak$/.test(k))&&!raiz.files.has('BANCO_SOLDA.json'),'JSON antigo virou BANCO_SOLDA_MIGRADO_<data>.bak');
  // banco de teste: 10 tubos livres de TTX
  A.db.modelos.push({prefixo:'TTX',descricao:'teste'});
  A.db.estoque.TTX=Array.from({length:10},(_,i)=>({lpn:'TTX'+String(i+1).padStart(3,'0'),fifo:i+1}));
  A.cu={nome:'MMT',login:'admin'};await A.save();

  const PCS=[A,novoPC('PC-B'),novoPC('PC-C'),novoPC('PC-D')];
  for(const p of PCS.slice(1))await conectar(p,raiz);
  ok(PCS.every(p=>p.db.estoque.TTX&&p.db.estoque.TTX.length===10),'os 4 PCs veem os 10 tubos de teste');

  console.log('2) 4 líderes pedindo 2 tubos TTX ao MESMO tempo (x3 rodadas, 12 pedidos p/ 10 tubos)');
  const ids=[];
  for(let r=0;r<3;r++){const res=await Promise.all(PCS.map((p,i)=>solicitar(p,'Lider'+i,'TTX',2)));ids.push(...res.filter(Boolean));}
  for(let i=0;i<3000&&PCS.some(p=>p.DB.writing||p.DB.pending);i++)await new Promise(r=>setTimeout(r,20));
  console.log('     erros de gravação (vão para nova tentativa): '+PCS.map(p=>p.DB.errCount).join(','));
  for(const p of PCS)await p.DB.pullNow();
  const sols=PCS[0].db.solicitacoes.filter(s=>s.modelo==='TTX');
  const pend=sols.filter(s=>s.status==='PENDENTE'),lpns=pend.flatMap(s=>s.reservados.map(t=>t.lpn));
  ok(lpns.length===new Set(lpns).size,'nenhum tubo reservado duas vezes ('+lpns.length+' reservas)');
  ok(lpns.length===10,'todos os 10 tubos foram reservados, nenhum perdido');
    ok(sols.length===ids.length,'nenhuma solicitação sumiu ('+sols.length+' de '+ids.length+' enviadas)');
  const hs=PCS[0].db.historico.filter(h=>h.tipo==='SOLICITACAO'&&h.modelo==='TTX');
  ok(hs.length===10&&new Set(hs.map(h=>h.lpn)).size===10,'histórico bate com as reservas ('+hs.length+' linhas)');
  ok(PCS.every(p=>resumo(p.db)===resumo(PCS[0].db)),'os 4 PCs terminaram com o MESMO banco');
  console.log('     (trocas/cancelamentos automáticos pela trava: '+PCS.reduce((a,p)=>a+p.toasts.filter(t=>/já tinha sido/.test(t[1])).length,0)+')');

  console.log('3) Edição e exclusão no histórico em PCs diferentes');
  const alvo=PCS[1].db.historico[5].id,apagar=PCS[2].db.historico[6].id;
  PCS[1].db.historico[5].obs='editado no B';PCS[2].db.historico=PCS[2].db.historico.filter(h=>h.id!==apagar);
  await Promise.all([PCS[1].save(),PCS[2].save()]);
  for(let i=0;i<100&&PCS.some(p=>p.DB.writing||p.DB.pending);i++)await new Promise(r=>setTimeout(r,20));
  for(const p of PCS)await p.DB.pullNow();
  ok(PCS.every(p=>(p.db.historico.find(h=>h.id===alvo)||{}).obs==='editado no B'),'edição chegou em todos');
  ok(PCS.every(p=>!p.db.historico.some(h=>h.id===apagar)),'exclusão chegou em todos (não "ressuscitou")');
  const E=novoPC('PC-E');await conectar(E,raiz);
  ok(resumo(E.db)===resumo(PCS[0].db),'PC novo abrindo do zero lê exatamente o mesmo banco');

  const banc=raiz.dirs.get('dados').dirs.get('banco');
  console.log('4) Arquivos na pasta:');
  for(const [k,v] of banc.files)console.log('     dados/banco/'+k+'  '+v.b.length+' bytes');
  for(const [k,v] of raiz.dirs.get('dados').dirs.get('movimentos').files)console.log('     dados/movimentos/'+k+'  '+v.b.length+' bytes');
  ok(!banc.files.has('.lock'),'nenhuma trava esquecida');
})().catch(e=>{console.error(e);process.exitCode=1;});
