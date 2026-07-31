// Do §02's two cards fill the content column at every width, and does the prototype do the same?
const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV}=process.env;
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:1000,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000}); await new Promise(r=>setTimeout(r,2200));
if(NAV==="1"){await click(p,"Companies");await new Promise(r=>setTimeout(r,1100));await click(p,"Institutional");await new Promise(r=>setTimeout(r,2000));}
for(const w of [1280,1440,1600,1920,1100,760]){
  await p.setViewport({width:w,height:1000,deviceScaleFactor:1});
  await new Promise(r=>setTimeout(r,450));
  const r=await p.evaluate((sel)=>{
    const sec=document.querySelector(sel); if(!sec) return null;
    const col=sec.getBoundingClientRect().width;
    const grid=[...sec.querySelectorAll("div")].find(d=>getComputedStyle(d).display==="grid"&&d.children.length===2&&d.getBoundingClientRect().width>200);
    if(!grid) return {col:Math.round(col),cards:null};
    const cards=[...grid.children].map(c=>Math.round(c.getBoundingClientRect().width));
    const gr=grid.getBoundingClientRect();
    return {col:Math.round(col), gridW:Math.round(gr.width), cards,
            fills: Math.abs((cards.reduce((a,c)=>a+c,0)+14*(cards.length-1)) - gr.width) < 2};
  },SEL);
  console.log(`${String(w).padStart(4)}  ${JSON.stringify(r)}`);
}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
