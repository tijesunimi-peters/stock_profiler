// What would the bands and the jump list do at the prototype's rail width + page padding?
const puppeteer=require("puppeteer");
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();await p.setViewport({width:1440,height:1200,deviceScaleFactor:1});
await p.goto("http://p5a-preview:8000/company/AAPL/institutional",{waitUntil:"networkidle0",timeout:90000});
await p.waitForSelector("#ip-01");await new Promise(r=>setTimeout(r,700));
const read=()=>p.evaluate(()=>{
  const R=e=>{const b=e.getBoundingClientRect();return {l:Math.round(b.left),w:Math.round(b.width)};};
  const links=[...document.querySelectorAll(".shell-sec")];
  return {rail:R(document.querySelector(".shell-rail")),content:R(document.querySelector("#ip-01")),
    right:R(document.querySelector(".right-rail")),
    linkH:links.map(a=>Math.round(a.getBoundingClientRect().height)),
    twoLine:links.filter(a=>a.getBoundingClientRect().height>30).length};
});
console.log("BEFORE",JSON.stringify(await read()));
await p.evaluate(()=>{const s=document.createElement("style");
  s.textContent=".page{padding-left:28px;padding-right:28px}.shell-rail{width:178px}.shell-viewport{max-width:694px}";
  document.head.appendChild(s);});
await new Promise(r=>setTimeout(r,400));
console.log("AFTER ",JSON.stringify(await read()));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
