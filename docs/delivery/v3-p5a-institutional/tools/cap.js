const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV}=process.env;
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000}); await new Promise(r=>setTimeout(r,2200));
if(NAV==="1"){await click(p,"Companies");await new Promise(r=>setTimeout(r,1100));await click(p,"Institutional");await new Promise(r=>setTimeout(r,2000));}
await p.evaluate(()=>{[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click());});
await new Promise(r=>setTimeout(r,1000));
let vw=1440;
for(let i=0;i<12;i++){const w=await p.evaluate(s=>document.querySelector(s).getBoundingClientRect().width,SEL);
  const d=Math.round(w)-694; if(d===0)break; vw-=d; await p.setViewport({width:Math.round(vw),height:1200,deviceScaleFactor:1}); await new Promise(r=>setTimeout(r,200));}
console.log(JSON.stringify(await p.evaluate((sel)=>{
  const sec=document.querySelector(sel);
  const cap=[...sec.querySelectorAll("div")].find(d=>/^Each panel is rebuilt/.test((d.textContent||"").trim()));
  const hdr=[...sec.querySelectorAll("div")].find(d=>/^Manager/i.test((d.textContent||"").trim())&&getComputedStyle(d).display==="grid");
  const r=e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);
    return {y:+b.top.toFixed(1),h:+b.height.toFixed(1),w:+b.width.toFixed(1),mt:c.marginTop,mb:c.marginBottom,pt:c.paddingTop,pb:c.paddingBottom,lh:c.lineHeight,tw:c.textWrap,fs:c.fontSize};};
  return {caption:cap?r(cap):null, header:hdr?r(hdr):null};
},SEL),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
