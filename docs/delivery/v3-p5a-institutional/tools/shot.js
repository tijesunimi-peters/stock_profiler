// Plain, unmodified screenshots of the ported view at a real viewport (no diff harness hacks).
const puppeteer=require("puppeteer");
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
for(const [w,tag] of [[1440,"1440"],[900,"900"],[430,"430"]]){
  const p=await b.newPage();
  await p.setViewport({width:w,height:1100,deviceScaleFactor:2});
  const errs=[];p.on("pageerror",e=>errs.push(String(e)));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto("http://p5a-preview:8000/company/AAPL/institutional",{waitUntil:"networkidle0",timeout:90000});
  await p.waitForSelector("#ip-01");await new Promise(r=>setTimeout(r,900));
  await p.screenshot({path:`/out/ours-view-${tag}.png`,fullPage:true});
  const col=await p.evaluate(()=>Math.round(document.querySelector("#ip-01").getBoundingClientRect().width));
  console.log(`viewport ${w} -> column ${col}px, errors: ${JSON.stringify(errs)}`);
  await p.close();
}
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
