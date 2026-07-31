// boxes.js with the expanders opened first.
const fs=require("fs"); const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV,OUTFILE}=process.env; const T=694;
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000}); await new Promise(r=>setTimeout(r,2200));
if(NAV==="1"){await click(p,"Companies");await new Promise(r=>setTimeout(r,1100));await click(p,"Institutional");await new Promise(r=>setTimeout(r,2000));}
await p.waitForSelector(SEL);
await p.evaluate(()=>{[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click());});
await new Promise(r=>setTimeout(r,1200));
let vw=1440;
for(let i=0;i<12;i++){const w=await p.evaluate(s=>document.querySelector(s).getBoundingClientRect().width,SEL);
  const d=Math.round(w)-T; if(d===0)break; vw-=d; await p.setViewport({width:Math.round(vw),height:1200,deviceScaleFactor:1}); await new Promise(r=>setTimeout(r,250));}
const out=await p.evaluate((s)=>{const root=document.querySelector(s); const o=root.getBoundingClientRect(); const res=[];
  const rec=e=>{const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(" ");
    const b=e.getBoundingClientRect();
    if(own) res.push({t:own,x:+(b.left-o.left).toFixed(1),y:+(b.top-o.top).toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)});
    [...e.children].forEach(rec);}; rec(root);
  return {h:+o.height.toFixed(1),out:res};},SEL);
fs.writeFileSync(OUTFILE,JSON.stringify(out,null,1)); console.log(OUTFILE,"h",out.h,"boxes",out.out.length);
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
