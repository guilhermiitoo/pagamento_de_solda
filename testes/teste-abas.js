// Entra no sistema com o banco REAL e abre todas as abas, procurando erro.
const fs=require('fs');
const {chromium}=require('playwright');
const RAIZ=require('path').join(__dirname,'..');
const ARQ=RAIZ+'/TPV_SolderControl_v11_0.html';
const BANCO=fs.readFileSync(RAIZ+'/ARQUIVO LIMPO 10-06 .json','utf8');

(async()=>{
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const ctx=await b.newContext();
  const externos=[],erros=[];
  await ctx.route('**://*/**',r=>{const u=r.request().url();
    if(/^https?:/.test(u)){externos.push(u);return r.abort();}r.continue();});
  const pg=await ctx.newPage();
  pg.on('pageerror',e=>erros.push('ERRO: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')erros.push('console: '+m.text());});
  await pg.goto('file://'+ARQ,{waitUntil:'load'});

  // "conecta" um banco da rede de mentira, com o conteúdo real do usuário
  await pg.evaluate(txt=>{
    let conteudo=txt;
    dbHandle={name:'ARQUIVO LIMPO 10-06 .json',
      async getFile(){return{lastModified:Date.now(),size:conteudo.length,async text(){return conteudo;}};},
      async createWritable(){let buf='';return{async write(t){buf=t;},async close(){conteudo=buf;}};}};
    DB.adotar(JSON.parse(conteudo),Date.now(),conteudo,conteudo.length);
    dbLoaded('ARQUIVO LIMPO 10-06 .json');
  },BANCO);

  // entra como o admin do MMT
  await pg.evaluate(()=>{cu=db.usuarios.find(u=>u.setor==='MMT');startApp();});
  await pg.waitForTimeout(300);

  const abas=['dashboard','estoque','requisicao','solicitacoes','historico','analise','correcao','etiqueta','config','limpeza'];
  console.log('\n── Abas (logado como MMT, banco real de 1.535 registros) ──');
  for(const t of abas){
    const antes=erros.length;
    const t0=Date.now();
    await pg.evaluate(t=>switchTab(t),t);
    await pg.waitForTimeout(120);
    const ms=Date.now()-t0;
    const vis=await pg.evaluate(t=>{const e=document.getElementById('page-'+t);return e?e.classList.contains('active'):false;},t);
    const novos=erros.length-antes;
    console.log('  '+(novos?'FALHA':'ok    ')+'  '+t.padEnd(14)+(vis?'abriu':'NÃO ABRIU').padEnd(11)+ms+' ms'+(novos?'   '+erros.slice(antes).join(' | '):''));
  }

  // importa uma planilha do WH em CSV, no formato que causava o "1 g"
  const csv='Relatorio WH\nOP;INVOICE;QTD;Peso (g);RESERVA\n1144767;INV-01;10;1.101;PL-1\n1144768;INV-02;8;850;PL-2\n1144768;INV-02;2;300;PL-2\n';
  const imp=await pg.evaluate(txt=>{
    const r=anLerAOA(anCsvParaAOA(txt));
    return r&&r.itens.map(i=>i.op+' → '+i.peso+' g (planilha: "'+i.pesoTxt+'")');
  },csv);
  console.log('\n── Importação de planilha CSV do WH ──');
  (imp||['FALHOU']).forEach(l=>console.log('  '+l));

  console.log('\n  pedidos à internet : '+(externos.length?externos.join(', '):'NENHUM ✓'));
  console.log('  erros              : '+(erros.length?erros.join(' | '):'nenhum ✓'));
  await b.close();
  process.exit(erros.length||externos.length?1:0);
})();
