// Column arithmetic at 1440: what each band actually occupies, prototype vs port.
const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV}=process.env;
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await new Promise(r=>setTimeout(r,2500));
if(NAV==="1"){await click(p,"Companies");await new Promise(r=>setTimeout(r,1200));await click(p,"Institutional");await new Promise(r=>setTimeout(r,2200));}
console.log(JSON.stringify(await p.evaluate((sel)=>{
  const R=e=>{const b=e.getBoundingClientRect();return {l:Math.round(b.left),w:Math.round(b.width)};};
  const sec=document.querySelector(sel);
  // walk out from the section collecting every ancestor band, plus the rails by text
  const all=[...document.querySelectorAll("nav,aside,div")];
  const railEl=all.find(e=>/^VIEWS/i.test((e.innerText||"").trim())&&e.getBoundingClientRect().width<300&&e.getBoundingClientRect().width>60);
  const rightEl=all.find(e=>/FILING TIMELINE/i.test((e.innerText||"").trim())&&e.getBoundingClientRect().width<320&&e.getBoundingClientRect().width>150);
  const sideEl=all.find(e=>/ClearyFi|SUBJECTS/i.test((e.innerText||"").trim())&&e.getBoundingClientRect().width<300&&e.getBoundingClientRect().width>150&&e.getBoundingClientRect().height>400);
  // the section nav's longest label, and whether it wraps
  const secLinks=[...document.querySelectorAll("a")].filter(a=>/^0\d/.test((a.innerText||"").trim()));
  return {
    viewport:window.innerWidth,
    sidebar: sideEl?R(sideEl):null,
    viewRail: railEl?R(railEl):null,
    content: R(sec),
    rightRail: rightEl?R(rightEl):null,
    secLinkCount: secLinks.length,
    secLinkHeights: secLinks.map(a=>Math.round(a.getBoundingClientRect().height)),
    secLinkW: secLinks.length?Math.round(secLinks[0].getBoundingClientRect().width):null,
  };
},SEL),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
