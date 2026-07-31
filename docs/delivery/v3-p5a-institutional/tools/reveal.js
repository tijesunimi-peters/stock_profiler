// Click an element by its (transformed) leading text and dump the outerHTML of what appeared.
const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV,OPEN,PICK,GRAB}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
if(NAV==="1"){await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);}
await p.waitForSelector(SEL);
if(OPEN==="1"){await p.evaluate(()=>[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||"")).forEach(b=>b.click()));await wait(1500);}
const before=await p.evaluate(s=>document.querySelector(s).innerText,SEL);
await p.evaluate((sel,pick)=>{const r=document.querySelector(sel);const e=[...r.querySelectorAll("div,span,button")].filter(e=>(e.innerText||"").replace(/\s+/g," ").trim().startsWith(pick)).pop();if(e)e.click();},SEL,PICK);
await wait(1500);
const after=await p.evaluate(s=>document.querySelector(s).innerText,SEL);
const bl=before.split("\n"), al=after.split("\n");
console.log("--- NEW LINES ---");
al.filter(l=>!bl.includes(l)).forEach(l=>console.log("  +",JSON.stringify(l)));
if(GRAB) console.log("\n--- HTML ---\n"+await p.evaluate((sel,g)=>{const r=document.querySelector(sel);const e=[...r.querySelectorAll("div")].filter(e=>(e.textContent||"").replace(/\s+/g," ").trim().startsWith(g))[0];return e?e.outerHTML.slice(0,14000):"not found";},SEL,GRAB));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
