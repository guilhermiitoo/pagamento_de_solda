// Carrega o <script> principal do sistema num sandbox com DOM de mentira.
const fs=require('fs'), vm=require('vm');

function dummyEl(){
  const el={value:'',textContent:'',innerHTML:'',style:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},
    addEventListener(){},removeEventListener(){},appendChild(){},remove(){},setAttribute(){},getAttribute(){return null},
    focus(){},select(){},click(){},querySelector(){return dummyEl()},querySelectorAll(){return []},
    getContext(){return null},clientWidth:600,parentNode:null,children:[]};
  el.parentNode=el;return el;
}
function carregar(htmlPath){
  const h=fs.readFileSync(htmlPath,'utf8');
  const i=h.indexOf('<script>'), j=h.indexOf('</script>',i);
  const code=h.slice(i+8,j);
  const doc={getElementById(){return dummyEl()},querySelector(){return dummyEl()},querySelectorAll(){return []},
    createElement(){return dummyEl()},body:dummyEl(),addEventListener(){},hidden:false};
  const ctx={document:doc,console,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},
    localStorage:{_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}},
    indexedDB:undefined,navigator:{clipboard:null},alert(){},confirm(){return true},
    Blob:function(){},URL:{createObjectURL(){return 'blob:x'},revokeObjectURL(){}},
    FileReader:function(){},Date,JSON,Math,parseInt,parseFloat,isFinite,String,Number,Object,Array,Promise,Error,Map,Set,RegExp,
    requestAnimationFrame:f=>setTimeout(f,0)};
  ctx.window=ctx; ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(code,ctx,{filename:'app.js'});
  return ctx;
}
module.exports={carregar};
