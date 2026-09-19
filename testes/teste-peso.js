const {carregar}=require('./harness.js');
const RAIZ=require('path').join(__dirname,'..');
const c=carregar(RAIZ+'/TPV_SolderControl_v11_0.html');
let ok=0,fail=0;
const eq=(nome,got,exp)=>{const bom=Math.abs(got-exp)<1e-6;
  console.log((bom?'  ok  ':'  FALHA')+'  '+nome.padEnd(34)+' => '+got+(bom?'':'   (esperado '+exp+')'));
  bom?ok++:fail++;};

console.log('\n── Leitura do peso da planilha do WH (gramas) ──');
// formato pt-BR
eq('"1.101"',            c.anPeso('1.101').g, 1101);
eq('"1.101,5"',          c.anPeso('1.101,5').g, 1101.5);
eq('"850"',              c.anPeso('850').g, 850);
eq('"12.345,67"',        c.anPeso('12.345,67').g, 12345.67);
// formato americano (vinha do WH e virava 1 g)
eq('"1,101"',            c.anPeso('1,101').g, 1101);
eq('"1,101.00"',         c.anPeso('1,101.00').g, 1101);
eq('"2,400.50"',         c.anPeso('2,400.50').g, 2400.5);
// número já quebrado pelo leitor de CSV  ← o bug do "1 g"
eq('número 1.101',       c.anPeso(1.101).g, 1101);
eq('número 0.85',        c.anPeso(0.85).g, 850);
eq('número 1101',        c.anPeso(1101).g, 1101);
eq('número 850',         c.anPeso(850).g, 850);
// com unidade e espaços
eq('"1.101 g"',          c.anPeso(' 1.101 g ').g, 1101);
eq('vazio',              c.anPeso('').g, 0);
eq('texto',              c.anPeso('N/A').g, 0);

console.log('\n── Classificação da OP (tubo de 300 g, tolerância 50%) ──');
const casos=[
  ['plano 1101 g · 4 tubos pagos (1200)', 1101, 1200, 4, 'OK'],
  ['plano 1101 g · 3 tubos pagos (900)',  1101,  900, 3, 'ABAIXO'],
  ['plano  850 g · 3 tubos pagos (900)',   850,  900, 3, 'OK'],
  ['plano  850 g · 4 tubos pagos (1200)',  850, 1200, 4, 'CRITICO'],
  ['plano  850 g · 2 tubos pagos (600)',   850,  600, 2, 'ABAIXO'],
  ['plano 1000 g · 3 tubos pagos (900)',  1000,  900, 3, 'ATENCAO'],
  ['plano  850 g · nada pago',             850,    0, 0, 'SEM_PGTO'],
  ['sem peso na planilha',                   0,  300, 1, 'SEM_PESO'],
];
casos.forEach(([nome,peso,gPago,tubos,exp])=>{
  const got=c.anSituacao(peso,gPago,tubos,300,50);
  const bom=got===exp;
  console.log((bom?'  ok  ':'  FALHA')+'  '+nome.padEnd(38)+' => '+got+(bom?'':'   (esperado '+exp+')'));
  bom?ok++:fail++;
});

console.log('\n'+ok+' ok · '+fail+' falha(s)');
process.exit(fail?1:0);
