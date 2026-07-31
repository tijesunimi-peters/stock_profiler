// Diff ONE ported section against its capture, collapsed or expanded.
//   SEC=ip-02 PROTO=i2 OPEN=1 node sec.js
const fs=require("fs"); const puppeteer=require("puppeteer");
const SEC=process.env.SEC, OPEN=process.env.OPEN==="1", TARGET=694;
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();await p.setViewport({width:1440,height:1200,deviceScaleFactor:2});
const errs=[];p.on("pageerror",e=>errs.push("pageerror: "+e.message));p.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text())});
await p.goto("http://p5a-preview:8000/company/AAPL/institutional",{waitUntil:"networkidle0",timeout:90000});
await p.waitForSelector("#"+SEC);
await p.evaluate((t)=>{const s=document.createElement("style");s.textContent=`#view{width:${t}px;max-width:${t}px;}`;document.head.appendChild(s);},TARGET);
if(OPEN) await p.evaluate(()=>{document.querySelectorAll(".ip-expander-btn").forEach(b=>b.click());});
await new Promise(r=>setTimeout(r,700));
await p.evaluate((s)=>{const r=document.querySelector("#"+s).getBoundingClientRect();const v=document.querySelector("#view");
  v.style.marginLeft=-(r.left-Math.floor(r.left))+"px"; v.style.marginTop=-(r.top-Math.floor(r.top)-0.5)+"px";},SEC);
await new Promise(r=>setTimeout(r,300));
const geo=await p.evaluate((s)=>{const r=document.querySelector("#"+s).getBoundingClientRect();
  return {w:Math.round(r.width),h:+r.height.toFixed(1)};},SEC);
const el=await p.$("#"+SEC);
await el.evaluate(e=>e.scrollIntoView({block:"center"})); await new Promise(r=>setTimeout(r,400));
await el.screenshot({path:`/out/ours-${SEC}${OPEN?"-open":""}.png`});
console.log(JSON.stringify({geo,errs}));
await b.close()})().catch(e=>{console.error("FATAL",e);process.exit(1)});
