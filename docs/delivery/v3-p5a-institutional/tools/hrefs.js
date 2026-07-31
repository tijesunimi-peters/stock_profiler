const puppeteer=require("puppeteer");
const {URL:U}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);
await p.evaluate(()=>[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click()));await wait(1500);
console.log(JSON.stringify(await p.evaluate(()=>{
  const out={};
  ["i1","i2","i3","i4"].forEach(id=>{const s=document.getElementById(id); if(!s)return;
    out[id]=[...s.querySelectorAll("a")].map(a=>({t:(a.innerText||"").trim(),href:a.getAttribute("href"),target:a.getAttribute("target"),rel:a.getAttribute("rel")}));});
  return out;}),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
