/* Screenshot §04 (capital & ownership) for eyeballing. */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]);
const OUT=resolve(process.argv[process.argv.indexOf("--out")+1]);
const PORT=5205, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
await mkdir(OUT,{recursive:true});
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
for (const w of [1440, 420]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:1800});
  for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
    await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
    await p.waitForFunction(()=>!!document.querySelector("#s4"),{timeout:90000});
    await new Promise(r=>setTimeout(r,700));
    const band = await p.evaluateHandle(()=>document.querySelector("#s4")?.closest(".hub-sec")).then(h=>h.asElement());
    if (band) await band.screenshot({path: join(OUT, `s4-${TK}-${w}.png`)});
  }
  await p.close();
}
await b.close(); s.close();
console.log("shots ->", OUT);
