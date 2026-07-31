// Is the "svg authored wider than its mount" on /manager and the legacy view caused by the
// column change, or pre-existing? Measure with the new widths, then with V3-P2's restored.
const puppeteer=require("puppeteer");
const OLD=".page{padding-left:32px;padding-right:32px}.shell-rail{width:132px}.shell-viewport{max-width:960px}";
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
for(const [name,u] of [["company-legacy","/company/AAPL/institutional-legacy"],["manager","/manager/1067983"]]){
 for(const mode of ["new","old"]){
  const p=await b.newPage(); await p.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await p.goto("http://p5a-preview:8000"+u,{waitUntil:"networkidle0",timeout:60000});
  if(mode==="old"){ await p.evaluate((c)=>{const s=document.createElement("style");s.textContent=c;document.head.appendChild(s);},OLD); }
  await new Promise(r=>setTimeout(r,1400));
  const r=await p.evaluate(()=>[...document.querySelectorAll("svg")].map(s=>{
     const m=s.parentElement; const aw=parseFloat(s.getAttribute("width")); const mw=m?m.getBoundingClientRect().width:0;
     return (aw&&mw&&aw>mw+2)?{aw:Math.round(aw),mw:Math.round(mw)}:null;}).filter(Boolean));
  console.log(`${name} ${mode}: ${r.length} wider -> ${JSON.stringify(r.slice(0,4))}`);
  await p.close();
 }}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
