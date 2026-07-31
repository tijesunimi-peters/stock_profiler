// Is the view rail sticky? Report its computed position/top and where it sits before and after a
// scroll -- a sticky rail keeps its viewport y, a static one scrolls away with the page.
const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
if(NAV==="1"){await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);}
const probe=async(label)=>console.log(label, JSON.stringify(await p.evaluate((sel)=>{
  const e=document.querySelector(sel); if(!e) return "NOT FOUND";
  const c=getComputedStyle(e); const r=e.getBoundingClientRect();
  const pa=e.parentElement, pc=getComputedStyle(pa);
  return {pos:c.position, top:c.top, maxH:c.maxHeight, overflowY:c.overflowY, alignSelf:c.alignSelf,
    y:+r.top.toFixed(1), h:+r.height.toFixed(1),
    parent:{tag:pa.tagName.toLowerCase(), display:pc.display, alignItems:pc.alignItems, h:Math.round(pa.getBoundingClientRect().height)}};
},SEL)));
await probe("before scroll:");
await p.evaluate(()=>window.scrollTo(0,2500)); await wait(600);
await probe("after  scroll:");
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
