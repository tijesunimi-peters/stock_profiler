const puppeteer=require("puppeteer");
const {URL:U,SEL}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2500);
console.log(JSON.stringify(await p.evaluate((sel)=>{
  let e=document.querySelector(sel), out=[], i=0;
  while(e && i++<7){const c=getComputedStyle(e); const r=e.getBoundingClientRect();
    out.push({tag:e.tagName.toLowerCase(), cls:(e.className||"").toString().slice(0,34),
      display:c.display, alignItems:c.alignItems, pos:c.position, h:Math.round(r.height)});
    e=e.parentElement;}
  return out;},SEL),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
