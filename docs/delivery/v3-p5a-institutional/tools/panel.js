const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV}=process.env;
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000}); await new Promise(r=>setTimeout(r,2200));
if(NAV==="1"){await click(p,"Companies");await new Promise(r=>setTimeout(r,1100));await click(p,"Institutional");await new Promise(r=>setTimeout(r,2000));}
await p.evaluate(()=>{[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click());});
await new Promise(r=>setTimeout(r,1000));
console.log(JSON.stringify(await p.evaluate((sel)=>{
  const sec=document.querySelector(sel);
  const panel=[...sec.querySelectorAll("div")].find(d=>/^Index manager A/.test((d.innerText||"").trim())&&d.getBoundingClientRect().width<260);
  if(!panel) return "no panel";
  const r=e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);
    return {h:+b.height.toFixed(2),w:+b.width.toFixed(2),lh:c.lineHeight,fs:c.fontSize,mt:c.marginTop,mb:c.marginBottom,disp:c.display};};
  return {panel:r(panel),kids:[...panel.children].map(k=>({tag:k.tagName.toLowerCase(),...r(k)}))};
},SEL),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
