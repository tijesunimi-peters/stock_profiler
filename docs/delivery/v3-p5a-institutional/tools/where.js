const puppeteer=require("puppeteer");
const {URL:U,SEL,NAV,LABEL,NTH="0",PICK}=process.env;
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ct=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(e)e.click();},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto(U,{waitUntil:"networkidle0",timeout:120000});await wait(2200);
if(NAV==="1"){await ct(p,"Companies");await wait(1200);await ct(p,"Institutional");await wait(2200);}
await p.waitForSelector(SEL);
console.log(JSON.stringify(await p.evaluate((sel,label)=>{
  const r=document.querySelector(sel);
  return [...r.querySelectorAll("button")].filter(e=>(e.innerText||"").replace(/\s+/g," ").trim()===label)
    .map(e=>{const b=e.getBoundingClientRect();const o=r.getBoundingClientRect();
      let chain=[],n=e.parentElement,i=0;
      while(n&&n!==r&&i++<4){chain.push(n.tagName.toLowerCase()+"("+Math.round(n.getBoundingClientRect().width)+"x"+Math.round(n.getBoundingClientRect().height)+")");n=n.parentElement;}
      return {y:+(b.top-o.top).toFixed(1),chain};});
},SEL,LABEL),null,1));
await p.evaluate((sel,label,nth)=>{const r=document.querySelector(sel);const all=[...r.querySelectorAll("button")].filter(e=>(e.innerText||"").replace(/\s+/g," ").trim()===label);if(all[nth])all[nth].click();},SEL,LABEL,+NTH);
await wait(1200);
console.log(JSON.stringify(await p.evaluate((sel,pick)=>{
  const r=document.querySelector(sel);const o=r.getBoundingClientRect();
  const el=[...r.querySelectorAll("div")].find(e=>(e.textContent||"").replace(/\s+/g," ").trim().startsWith(pick));
  if(!el)return"not found";
  const b=el.getBoundingClientRect();
  let chain=[],n=el.parentElement,i=0;
  while(n&&n!==r&&i++<5){chain.push(n.tagName.toLowerCase()+"("+Math.round(n.getBoundingClientRect().width)+"x"+Math.round(n.getBoundingClientRect().height)+")");n=n.parentElement;}
  const prev=el.previousElementSibling, next=el.nextElementSibling;
  return {y:+(b.top-o.top).toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),chain,
    prev:prev&&(prev.textContent||"").replace(/\s+/g," ").trim().slice(0,50),
    next:next&&(next.textContent||"").replace(/\s+/g," ").trim().slice(0,50)};
},SEL,PICK),null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
