// Abre o sistema num Chrome de verdade, SEM internet, e confere:
//  1. que nada é buscado na web        2. que a tela abre sem erro
//  3. quanto tempo leva para abrir     4. que o leitor de planilha liga sob demanda
const {chromium}=require('playwright');
const RAIZ=require('path').join(__dirname,'..');
const ARQ=process.argv[2]||RAIZ+'/TPV_SolderControl_v11_0.html';

(async()=>{
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const ctx=await b.newContext();
  const externos=[],erros=[];
  // Máquina SEM internet: qualquer pedido pra fora simplesmente não responde.
  await ctx.route('**://*/**',r=>{
    const u=r.request().url();
    if(/^https?:/.test(u)){externos.push(u);return r.abort();}
    r.continue();
  });
  const pg=await ctx.newPage();
  pg.on('pageerror',e=>erros.push(String(e)));
  pg.on('console',m=>{if(m.type()==='error')erros.push('console: '+m.text());});
  pg.on('request',r=>{if(/^https?:/.test(r.url()))externos.push(r.url());});

  const t0=Date.now();
  await pg.goto('file://'+ARQ,{waitUntil:'load'});
  const carga=Date.now()-t0;

  const r=await pg.evaluate(()=>({
    titulo:document.title,
    telaLogin:getComputedStyle(document.getElementById('login-screen')).display,
    icone:(document.querySelector('link[rel=icon]')||{}).href ? 'sim':'não',
    botaoAtalho:typeof criarAtalho==='function',
    xlsxJaLigado:typeof window.XLSX!=='undefined',
    graficoLocal:typeof desenharBarras==='function'&&typeof desenharRosca==='function',
    chartjs:typeof window.Chart!=='undefined'
  }));
  // liga o leitor de planilha sob demanda (como faz o botão de importar)
  const xl=await pg.evaluate(()=>{const t0=performance.now();const ok=!!libXLSX();
    return{ok,ms:Math.round(performance.now()-t0),versao:ok?window.XLSX.version:null};});

  // desenha os gráficos com dados de mentira
  const graf=await pg.evaluate(()=>{
    const cv=document.getElementById('chart-dia');
    try{desenharBarras(cv,[1,2,3],[0,5,2]);
        desenharRosca(document.getElementById('chart-modelo'),['TTO','TTC'],[7,3],['#1e6fa8','#27ae60']);
        return 'ok';}catch(e){return 'erro: '+e.message;}
  });

  console.log('\n── Abertura do sistema (Chrome, sem internet) ──');
  console.log('  título                    : '+r.titulo);
  console.log('  tempo até abrir           : '+carga+' ms');
  console.log('  pedidos para a internet   : '+(externos.length?externos.join(', '):'NENHUM ✓'));
  console.log('  tela de login apareceu    : '+(r.telaLogin!=='none'?'sim':'não'));
  console.log('  ícone do sistema          : '+r.icone);
  console.log('  botão de atalho           : '+(r.botaoAtalho?'sim':'não'));
  console.log('  gráficos locais           : '+(r.graficoLocal?'sim':'não')+'   (Chart.js da web presente: '+(r.chartjs?'SIM':'não')+')');
  console.log('  desenho dos 2 gráficos    : '+graf);
  console.log('\n── Leitor de planilha embutido ──');
  console.log('  já ligado ao abrir        : '+(r.xlsxJaLigado?'sim (pesa a abertura)':'não ✓ (só liga quando precisa)'));
  console.log('  ligou sob demanda         : '+(xl.ok?'sim, versão '+xl.versao+' em '+xl.ms+' ms':'NÃO'));
  console.log('\n  erros de JavaScript       : '+(erros.length?erros.join(' | '):'nenhum ✓'));

  await b.close();
  const falhou=externos.length||erros.length||!xl.ok||graf!=='ok'||r.chartjs;
  console.log('\n'+(falhou?'>>> FALHOU':'>>> TUDO OK'));
  process.exit(falhou?1:0);
})();
