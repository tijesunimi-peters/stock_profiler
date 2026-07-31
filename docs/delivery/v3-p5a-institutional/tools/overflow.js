// Blast-radius check for the shell-wide column change: does any page now scroll sideways,
// clip a chart, or leave a chart authored wider than its mount?
const puppeteer=require("puppeteer");
const URLS=[["company-hub","/company/AAPL"],["company-history","/company/AAPL/history"],
 ["company-insider","/company/AAPL/insider"],["company-inst","/company/AAPL/institutional"],
 ["company-legacy","/company/AAPL/institutional-legacy"],["company-beneficial","/company/AAPL/beneficial"],
 ["sectors","/sectors"],["sectors-company","/sectors?view=company&symbol=320193"],
 ["compare","/compare?symbols=AAPL,JPM,WMT"],["screen","/screen?view=rank&concept=revenue&year=2024&sort=desc&limit=25"],
 ["manager","/manager/1067983"]];
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
for(const w of [1440,1280]){
 for(const [name,u] of URLS){
  const p=await b.newPage(); await p.setViewport({width:w,height:1000,deviceScaleFactor:1});
  const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  try{ await p.goto("http://p5a-preview:8000"+u,{waitUntil:"networkidle0",timeout:60000}); }
  catch(e){ console.log(`${w} ${name}: LOAD FAIL`); await p.close(); continue; }
  await new Promise(r=>setTimeout(r,900));
  const r=await p.evaluate(()=>{
    const de=document.documentElement;
    const over=[...document.querySelectorAll("body *")].filter(e=>{
      const b=e.getBoundingClientRect();
      return b.width>0 && (b.right>window.innerWidth+1.5||b.left<-1.5) && getComputedStyle(e).overflowX!=="auto" && getComputedStyle(e).overflowX!=="scroll";
    }).slice(0,3).map(e=>e.tagName.toLowerCase()+"."+String(e.className).slice(0,28));
    const svgs=[...document.querySelectorAll("svg")].map(s=>{
      const m=s.parentElement; if(!m) return 0;
      const aw=parseFloat(s.getAttribute("width")); const mw=m.getBoundingClientRect().width;
      return (aw&&mw&&aw>mw+2)?1:0;}).reduce((a,c)=>a+c,0);
    return {hScroll:de.scrollWidth>de.clientWidth+1, over, svgOver:svgs};
  });
  const bad=r.hScroll||r.over.length||r.svgOver||errs.length;
  if(bad) console.log(`${w} ${name}: hScroll=${r.hScroll} over=${JSON.stringify(r.over)} svgWider=${r.svgOver} errs=${errs.length}`);
  await p.close();
 }
 console.log(`--- ${w} done ---`);
}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
