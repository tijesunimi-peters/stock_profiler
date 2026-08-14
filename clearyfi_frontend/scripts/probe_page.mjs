/* What does the overview page actually render for a ticker? Prints the first 900 chars. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer";
const DIST=resolve(process.argv[process.argv.indexOf("--dist")+1]), PORT=5187, API="http://127.0.0.1:8000";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2"};
const s=createServer(async(rq,rs)=>{const u=new URL(rq.url,`http://localhost:${PORT}`);
  if(u.pathname.startsWith("/v1")){const r=await fetch(API+u.pathname+u.search);
    rs.writeHead(r.status,{"content-type":"application/json"});rs.end(await r.text());return;}
  let f=join(DIST,decodeURIComponent(u.pathname));
  if(!extname(u.pathname)||!existsSync(f))f=join(DIST,"index.html");
  rs.writeHead(200,{"content-type":MIME[extname(f)]??"application/octet-stream"});rs.end(await readFile(f));});
await new Promise(r=>s.listen(PORT,r));
const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage(); await p.setViewport({width:1440,height:2400});
p.on("pageerror",e=>console.log("PAGEERROR:", e.message));
p.on("response",r=>{if(r.url().includes("/v1/")&&r.status()>=400)console.log("  HTTP",r.status(),r.url().replace(/^.*\/v1/,"/v1"));});
for (const TK of (process.env.TICKERS||"AAPL").split(",")) {
  await p.goto(`http://localhost:${PORT}/company/${TK}/overview?focal=${TK}`,{waitUntil:"networkidle0"});
  await new Promise(r=>setTimeout(r,3000));
  const t = await p.evaluate(()=>document.querySelector(".alt-content")?.innerText.replace(/\s+/g," ")||"(no .alt-content)");
  console.log(`\n── ${TK} ──\n`, t.slice(0,700));
  const aud = await p.evaluate(()=>{
    const m=[...document.querySelectorAll("*")].find(e=>e.children.length===0&&/Independent auditor/i.test(e.textContent||""));
    return m ? (m.parentElement?.textContent||"").replace(/\s+/g," ") : "(row not found)";
  });
  console.log("   §01 auditor row:", aud.slice(0,120));
}
await b.close(); s.close();
