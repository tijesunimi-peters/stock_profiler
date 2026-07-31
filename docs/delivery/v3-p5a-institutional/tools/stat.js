const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV,PICK}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);
await p.waitForSelector(SEL);
const h0=await p.evaluate(s=>document.querySelector(s).getBoundingClientRect().height,SEL);
const hit=await p.evaluate((sel,pick)=>{
  const r=document.querySelector(sel);
  const e=[...r.querySelectorAll("div")].filter(e=>(e.innerText||"").replace(/\s+/g," ").trim().startsWith(pick)).pop();
  if(!e)return false; e.scrollIntoView({block:"center"}); e.click(); return true;},SEL,PICK);
await wait(1500);
const h1=await p.evaluate(s=>document.querySelector(s).getBoundingClientRect().height,SEL);
console.log(JSON.stringify({hit,h0,h1,delta:+(h1-h0).toFixed(1)}));
await p.screenshot({path:"/gt/x-stat.png"});
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
