// TESTE DA ENGENHARIA DE SALVAMENTO (v13.1) — Chrome de verdade, 2 "PCs".
// Os dois PCs são duas abas do Chrome usando a MESMA pasta (OPFS: uma pasta real
// do navegador, com a mesma API de arquivos da pasta da rede).
//
// uso:  node teste-salvamento.js [banco.json] [html]
//   (precisa do playwright:  npm i playwright)
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const RAIZ=path.join(__dirname,'..');
const HTML=path.resolve(process.argv[3]||path.join(RAIZ,'TPV_SolderControl_v13_1.html'));
const BANCO=JSON.parse(fs.readFileSync(process.argv[2]||path.join(RAIZ,'ARQUIVO LIMPO 10-06 .json'),'utf8'));

let falhas=0;
const ok=(c,m)=>{console.log((c?'  ✅ ':'  ❌ ')+m);if(!c)falhas++;};

// tubos de teste: TTX (10 tubos) e TTY (5 tubos) — modelos que não existem no banco real
BANCO.modelos=(BANCO.modelos||[]).concat([{prefixo:'TTX',descricao:'teste'},{prefixo:'TTY',descricao:'teste'}]);
BANCO.estoque=BANCO.estoque||{};
BANCO.estoque.TTX=Array.from({length:10},(_,i)=>({lpn:'TTX'+String(i+1).padStart(4,'0'),fifo:i+1,addedAt:'2026-11-01T08:00:00Z'}));
BANCO.estoque.TTY=Array.from({length:5},(_,i)=>({lpn:'TTY'+String(i+1).padStart(4,'0'),fifo:i+1,addedAt:'2026-11-01T08:00:00Z'}));
BANCO.solicitacoes=(BANCO.solicitacoes||[]).map(s=>s.status==='PENDENTE'?{...s,status:'CANCELADA'}:s);   // começa sem pendências

(async()=>{
  const srv=http.createServer((q,r)=>{fs.readFile(HTML,(e,b)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(b);});}).listen(0);
  const URL='http://localhost:'+srv.address().port+'/';
  const b=await chromium.launch();const ctx=await b.newContext();
  const erros=[];
  const abrir=async pc=>{const p=await ctx.newPage();// o Chrome de teste trava ao reconectar sozinho numa pasta OPFS lembrada: no teste a reconexão automática fica desligada
    await p.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:null});});p.on('pageerror',e=>erros.push(pc+': '+e.message));
    p.on('dialog',d=>{p._dialogos=(p._dialogos||0)+1;d.accept();});
    await p.goto(URL+'#pc='+pc);await p.waitForFunction(()=>typeof PASTA==='object');
    await p.evaluate(()=>{const t=window.toast;window.__toasts=[];window.toast=(m,ty,ms)=>{__toasts.push([ty||'',m]);t(m,ty,ms);};
      // "Wi-Fi": __off=true faz toda leitura/gravação da pasta falhar como rede caída
      const rede=()=>{if(window.__off)throw new DOMException('A rede não está acessível','NetworkError');};
      ['ler','gravar','anexar'].forEach(f=>{const o=PASTA[f].bind(PASTA);PASTA[f]=async(...a)=>{rede();return o(...a);};});});
    return p;};

  // ---------- A) pasta: recusa sem confirmação; migração do JSON antigo ----------
  console.log('\nA) Pasta do sistema e migração');
  const A=await abrir('PC-A');
  await A.evaluate(async txt=>{
    const r=await navigator.storage.getDirectory();
    for await(const [n] of r.entries())await r.removeEntry(n,{recursive:true});
    const dh=await r.getDirectoryHandle('BD_Solda',{create:true});
    const w=await (await dh.getFileHandle('BANCO_SOLDA.json',{create:true})).createWritable();await w.write(txt);await w.close();
  },JSON.stringify(BANCO));
  const semConf=await A.evaluate(async()=>{const dh=await (await navigator.storage.getDirectory()).getDirectoryHandle('BD_Solda');
    const r=await _concluirConexao(dh);const nomes=[];for await(const [n] of dh.entries())nomes.push(n);return{r,nomes};});
  ok(semConf.r===false&&!semConf.nomes.includes('dados'),'pasta SEM o arquivo de confirmação é recusada e nada é criado');
  const mig=await A.evaluate(async()=>{const dh=await (await navigator.storage.getDirectory()).getDirectoryHandle('BD_Solda');
    const w=await (await dh.getFileHandle('SOLDA_PASTA_DO_SISTEMA.json',{create:true})).createWritable();await w.write('{"sistema":"SOLDA_MMT"}');await w.close();
    const r=await _concluirConexao(dh);const nomes=[];for await(const [n] of dh.entries())nomes.push(n);
    return{r,nomes,h:db.historico.length,s:db.solicitacoes.length,u:db.usuarios.length,e:JSON.stringify(db.estoque)};});
  ok(mig.r===true,'com a confirmação, o banco abre (JSON antigo convertido automaticamente)');
  ok(mig.h===BANCO.historico.length&&mig.s===BANCO.solicitacoes.length&&mig.u===BANCO.usuarios.length,
     'nada perdido: '+mig.h+' histórico, '+mig.s+' solicitações, '+mig.u+' usuários');
  ok(mig.nomes.some(n=>/^BANCO_SOLDA_MIGRADO_\d{4}-\d{2}-\d{2}\.bak$/.test(n))&&!mig.nomes.includes('BANCO_SOLDA.json'),
     'JSON antigo guardado como BANCO_SOLDA_MIGRADO_<data>.bak');

  const B=await abrir('PC-B');
  for(const p of [A,B])await p.evaluate(async()=>{
    if(!dbHandle){const dh=await (await navigator.storage.getDirectory()).getDirectoryHandle('BD_Solda');await _concluirConexao(dh);}
    cu=db.usuarios.find(u=>u.setor!=='MMT')||db.usuarios[0];startApp();});
  ok((await B.evaluate(()=>db.estoque.TTX.length))===10,'PC-B abre a mesma pasta e vê os tubos');

  // pedido de solda pela tela de verdade (confirmarReq), como a líder faz
  const pedir=(p,lider,mod,qty)=>p.evaluate(async([lider,mod,qty])=>{
    cu=Object.assign({},db.usuarios.find(u=>u.setor!=='MMT')||db.usuarios[0],{nome:lider,login:lider});
    switchTab('requisicao');
    const set=(id,v)=>{const e=document.getElementById(id);if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===v)){const o=document.createElement('option');o.value=v;o.textContent=v;e.appendChild(o);}e.value=v;};
    set('rq-mod',mod);set('rq-linha','SMT 01');set('rq-qty',String(qty));
    set('rq-op2','1145994');set('rq-chassi','CH');set('rq-qtdkit','100');set('rq-invoice','INV');set('rq-pulllist','PL');set('rq-plano-modelo','MOD');
    const n0=__toasts.length;await confirmarReq();
    const sol=db.solicitacoes.filter(s=>s.lider===lider).sort((a,b)=>b.ts-a.ts)[0];
    return{toasts:__toasts.slice(n0).map(t=>t[1]),sol:sol&&{id:sol.id,status:sol.status,tubos:sol.reservados.map(t=>t.lpn)}};
  },[lider,mod,qty]);
  const estado=p=>p.evaluate(async()=>{await DB.pullNow();DB._fimOp();return{
    pend:db.solicitacoes.filter(s=>s.status==='PENDENTE').map(s=>({id:s.id,lider:s.lider,tubos:s.reservados.map(t=>t.lpn)})),
    sig:JSON.stringify([db.estoque,db.emUso,db.solicitacoes,db.historico.map(h=>h.id+h.lpn+h.tipo).sort()])};});
  const invariantes=async(rotulo)=>{
    const [ea,eb]=[await estado(A),await estado(B)];
    const lp=ea.pend.flatMap(s=>s.tubos);
    ok(lp.length===new Set(lp).size,rotulo+': nenhum tubo reservado para duas solicitações');
    ok(ea.sig===eb.sig,rotulo+': os dois PCs têm exatamente o mesmo banco');
    return ea;};

  // ---------- a) mesmo tubo ao mesmo tempo ----------
  console.log('\na) Duas líderes pedem o MESMO tubo ao mesmo tempo');
  const [ra,rb]=await Promise.all([pedir(A,'Lucimara','TTX',1),pedir(B,'Valcineide','TTX',1)]);
  ok(ra.sol.tubos[0]!==rb.sol.tubos[0],'cada uma ficou com um tubo: '+ra.sol.tubos+' / '+rb.sol.tubos);
  const avisoA=ra.toasts.find(t=>/já tinha sido reservado por/.test(t)),avisoB=rb.toasts.find(t=>/já tinha sido reservado por/.test(t));
  ok(!!avisoA!==!!avisoB,'só a segunda recebeu o aviso');
  console.log('     aviso: "'+(avisoA||avisoB)+'"');
  ok((avisoA&&!ra.toasts.some(t=>/enviada ao MMT/.test(t)))||(avisoB&&!rb.toasts.some(t=>/enviada ao MMT/.test(t))),'quem recebeu o aviso NÃO viu o "OK" normal');
  await invariantes('a');

  // ---------- b) tubos diferentes ao mesmo tempo ----------
  console.log('\nb) Solicitações de tubos diferentes ao mesmo tempo');
  const [ba,bb]=await Promise.all([pedir(A,'Keyla','TTX',1),pedir(B,'Vilma','TTY',1)]);
  ok(ba.sol.status==='PENDENTE'&&bb.sol.status==='PENDENTE','as duas gravaram');
  ok(!ba.toasts.concat(bb.toasts).some(t=>/já tinha sido|NÃO foi gravada|SEM CONEX/.test(t)),'nenhum aviso');
  ok(ba.toasts.some(t=>/enviada ao MMT/.test(t))&&bb.toasts.some(t=>/enviada ao MMT/.test(t)),'as duas viram o OK');
  await invariantes('b');

  // ---------- c) PC sem rede faz pedido, outro pega os tubos, o primeiro volta ----------
  console.log('\nc) PC sem Wi-Fi faz pedido; outro PC pega os tubos; o primeiro reconecta');
  await A.evaluate(()=>{window.__off=true;});
  const ca=await pedir(A,'Glacivaldo','TTX',2);
  ok(ca.toasts.some(t=>/SEM CONEXÃO — solicitação NÃO enviada/.test(t))&&!ca.toasts.some(t=>/enviada ao MMT/.test(t)),'sem rede: aparece "SEM CONEXÃO — solicitação NÃO enviada" (sem OK)');
  ok(await A.evaluate(()=>/SEM CONEXÃO/.test((document.getElementById('banner-rede')||{}).textContent||'')),'faixa vermelha "SEM CONEXÃO" na tela');
  const tubosOffline=ca.sol.tubos;
  const cb=await pedir(B,'Anderson','TTX',2);
  ok(JSON.stringify(cb.sol.tubos)===JSON.stringify(tubosOffline),'o outro PC (com rede) pegou justamente esses tubos: '+cb.sol.tubos);
  const n0=await A.evaluate(()=>__toasts.length);
  await A.evaluate(()=>{window.__off=false;});
  await A.waitForFunction(()=>!DB.sujo&&!DB.writing&&!Object.keys(DB.naoEnviadas).length,null,{timeout:30000});
  const cfim=await A.evaluate(([n0,id])=>{const s=db.solicitacoes.find(x=>x.id===id);return{toasts:__toasts.slice(n0).map(t=>t[1]),tubos:s.reservados.map(t=>t.lpn),status:s.status};},[n0,ca.sol.id]);
  ok(cfim.tubos.every(t=>!tubosOffline.includes(t))&&cfim.status==='PENDENTE','ao reconectar, o pedido foi CORRIGIDO para outros tubos: '+cfim.tubos);
  console.log('     aviso: "'+(cfim.toasts.find(t=>/já tinha sido/.test(t))||'(nenhum)')+'"');
  ok(cfim.toasts.some(t=>/já tinha sido reservado por Anderson/.test(t)),'e a líder recebeu o aviso com o nome de quem pegou');
  const ec=await invariantes('c');
  ok(ec.pend.find(s=>s.lider==='Anderson').tubos.join()===tubosOffline.join(),'nada sobrescrito: o pedido do Anderson continua com os tubos dele');

  console.log('\nc2) Sem rede por mais de 10 minutos: pede confirmação antes de enviar');
  await A.evaluate(()=>{window.__off=true;});
  const c2=await pedir(A,'Glacivaldo','TTY',1);
  const d0=await A.evaluate(()=>{Object.keys(DB.naoEnviadas).forEach(id=>DB.naoEnviadas[id]-=11*60000);return 0;});
  A._dialogos=0;
  await A.evaluate(()=>{window.__off=false;});
  await A.waitForFunction(()=>!DB.sujo&&!DB.writing&&!Object.keys(DB.naoEnviadas).length,null,{timeout:30000});
  ok(A._dialogos>=1,'a líder confirmou ("o estoque mudou enquanto você estava sem rede") antes de gravar');
  ok(await A.evaluate(id=>(db.solicitacoes.find(s=>s.id===id)||{}).status==='PENDENTE',c2.sol.id),'pedido enviado depois da confirmação');
  await invariantes('c2');

  // ---------- d) novos saves dos dois PCs não apagam nada do outro ----------
  console.log('\nd) Depois disso, novos saves dos dois PCs');
  const antes=await estado(A);
  const [d1,d2]=await Promise.all([pedir(A,'Lucimara','TTY',1),pedir(B,'Valcineide','TTX',1)]);
  const depois=await invariantes('d');
  ok(antes.pend.every(s=>depois.pend.some(x=>x.id===s.id&&x.tubos.join()===s.tubos.join())),'todas as solicitações anteriores continuam iguais');
  ok([d1,d2].every(r=>depois.pend.some(x=>x.id===r.sol.id)),'as duas novas também estão lá');

  // ---------- e) dois MMT entregam a MESMA solicitação ao mesmo tempo ----------
  console.log('\ne) Dois PCs do MMT entregam a MESMA solicitação ao mesmo tempo');
  const alvo=depois.pend.find(s=>s.lider==='Keyla');
  const ent=p=>p.evaluate(async id=>{cu=db.usuarios.find(u=>u.setor==='MMT');const n0=__toasts.length;await entregarSolic(id);return __toasts.slice(n0).map(t=>t[1]);},alvo.id);
  const [ea,eb]=await Promise.all([ent(A),ent(B)]);
  const okE=[ea,eb].filter(t=>t.some(x=>/^Entregue para/.test(x))).length;
  ok(okE===1,'só um PC viu "Entregue"; o outro foi avisado ('+(ea.concat(eb).find(x=>/NÃO foi gravada|já foi tratada/.test(x))||'?').slice(0,90)+'…)');
  const fe=await invariantes('e');
  const saidas=await A.evaluate(l=>db.historico.filter(h=>h.tipo==='SAIDA'&&h.lpn===l).length,alvo.tubos[0]);
  ok(saidas===1,'o tubo saiu UMA vez só (1 linha de SAÍDA no histórico)');

  ok(!erros.length,'nenhum erro de JavaScript'+(erros.length?': '+erros.join(' | '):''));
  console.log('\n'+(falhas?'>>> '+falhas+' FALHA(S)':'>>> TUDO OK'));
  await b.close();srv.close();process.exitCode=falhas?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
