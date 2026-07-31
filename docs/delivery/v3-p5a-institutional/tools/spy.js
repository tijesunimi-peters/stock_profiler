// The rail's jump list can only be exercised once the sections have height -- §02..§07 are still
// empty shells. Give them a stand-in height, then scroll and read what the rail marks.
const puppeteer=require("puppeteer");
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();await p.setViewport({width:1440,height:1000,deviceScaleFactor:1});
const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.goto("http://p5a-preview:8000/company/AAPL/institutional",{waitUntil:"networkidle0",timeout:90000});
await p.waitForSelector("#ip-01");await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>{const s=document.createElement("style");
  s.textContent="#ip-02,#ip-03,#ip-04,#ip-05,#ip-06,#ip-07{min-height:1200px}";document.head.appendChild(s);});
await new Promise(r=>setTimeout(r,500));
const out=[];
for(const id of ["ip-01","ip-03","ip-05","ip-07","ip-02"]){
  await p.evaluate((i)=>document.getElementById(i).scrollIntoView({block:"start"}),id);
  await new Promise(r=>setTimeout(r,600));
  out.push({scrolledTo:id,railMarks:await p.evaluate(()=>{const a=document.querySelector(".shell-sec.active");return a?a.getAttribute("href"):null;})});
}
// and the anchor links themselves
await p.click('.shell-sec[href="#ip-06"]'); await new Promise(r=>setTimeout(r,700));
const afterClick=await p.evaluate(()=>({hash:location.hash,marks:(document.querySelector(".shell-sec.active")||{}).getAttribute && document.querySelector(".shell-sec.active").getAttribute("href")}));
console.log(JSON.stringify({out,afterClick,errs},null,1));
await b.close()})().catch(e=>{console.error("FATAL",e);process.exit(1)});
