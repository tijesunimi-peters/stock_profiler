// Smoke the ported view: rails present, sections nav, expander toggles, no console errors.
const puppeteer=require("puppeteer");
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();await p.setViewport({width:1440,height:1100,deviceScaleFactor:2});
const errs=[];p.on("pageerror",e=>errs.push("pageerror: "+e.message));p.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text())});
await p.goto("http://p5a-preview:8000/company/AAPL/institutional",{waitUntil:"networkidle0",timeout:90000});
await p.waitForSelector("#ip-01");await new Promise(r=>setTimeout(r,900));
const before=await p.evaluate(()=>({
  col:Math.round(document.querySelector("#ip-01").getBoundingClientRect().width),
  railW:Math.round(document.querySelector(".shell-rail").getBoundingClientRect().width),
  secLinks:[...document.querySelectorAll(".shell-sec")].map(a=>a.textContent),
  activeSec:(document.querySelector(".shell-sec.active")||{}).textContent||null,
  rightRail:!!document.querySelector(".ip-rr-card"),
  rightRailW:document.querySelector(".right-rail")?Math.round(document.querySelector(".right-rail").getBoundingClientRect().width):null,
  expanderBtn:(document.querySelector(".ip-expander-btn")||{}).textContent,
  bodyHidden:document.querySelector(".ip-expander-body").hasAttribute("hidden"),
  secH:Math.round(document.querySelector("#ip-01").getBoundingClientRect().height),
}));
await p.click(".ip-expander-btn"); await new Promise(r=>setTimeout(r,400));
const after=await p.evaluate(()=>({
  expanderBtn:document.querySelector(".ip-expander-btn").textContent,
  bodyHidden:document.querySelector(".ip-expander-body").hasAttribute("hidden"),
  secH:Math.round(document.querySelector("#ip-01").getBoundingClientRect().height),
  rows:document.querySelectorAll(".ip-ftab-row").length,
  speed:document.querySelectorAll(".ip-speed-row").length,
}));
// scroll-spy
await p.evaluate(()=>document.querySelector("#ip-04").scrollIntoView({block:"start"}));
await new Promise(r=>setTimeout(r,700));
const spy=await p.evaluate(()=>(document.querySelector(".shell-sec.active")||{}).textContent||null);
console.log(JSON.stringify({before,after,spyAfterScrollTo04:spy,errs},null,1));
await b.close()})().catch(e=>{console.error("FATAL",e);process.exit(1)});
