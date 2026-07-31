// viewBoxes of the SVGs inside the overlay a control opened
const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV,OPEN,LABEL,NTH="0"}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
if(NAV==="1"){await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);}
await p.waitForSelector(SEL);
if(OPEN==="1"){await p.evaluate(()=>[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click()));await wait(1500);}
await p.evaluate((sel,label,nth)=>{const r=document.querySelector(sel);const all=[...r.querySelectorAll("button,a,[role=button]")].filter(e=>(e.innerText||"").replace(/\s+/g," ").trim()===label);if(all[nth])all[nth].click();},SEL,LABEL,+NTH);
await wait(1500);
console.log(JSON.stringify(await p.evaluate(()=>{
  const ov=[...document.querySelectorAll("body *")].find(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();return c.position==="fixed"&&r.width>=window.innerWidth-2;});
  if(!ov) return "no overlay";
  return [...ov.querySelectorAll("svg")].map(s=>({vb:s.getAttribute("viewBox"),par:s.getAttribute("preserveAspectRatio"),style:s.getAttribute("style"),w:+s.getBoundingClientRect().width.toFixed(1),h:+s.getBoundingClientRect().height.toFixed(1)}));
}),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
