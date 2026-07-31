// Same as capture.js, but clicks every "+ Also in this section" expander first, so the ground
// truth includes what each one reveals. Writes proto-i<N>-open.png + literals-open.json.
const fs=require("fs"); const puppeteer=require("puppeteer");
const OUT="/out";
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1200,deviceScaleFactor:2});
await p.goto("http://proto-srv:9000/prototype.dc.html",{waitUntil:"networkidle0",timeout:120000});await new Promise(r=>setTimeout(r,2500));
await click(p,"Companies");await new Promise(r=>setTimeout(r,1200));
await click(p,"Institutional");await new Promise(r=>setTimeout(r,2200));
const n=await p.evaluate(()=>{
  const bs=[...document.querySelectorAll("button")].filter(b=>/also in this section/i.test(b.innerText||""));
  bs.forEach(b=>b.click()); return bs.length;});
console.log("expanders clicked:",n);
await new Promise(r=>setTimeout(r,2500));
const BOX=["display","flexDirection","gap","rowGap","columnGap","padding","margin","backgroundColor","border","borderTop","borderBottom","borderLeft","borderRadius","boxShadow","fontFamily","fontSize","fontWeight","letterSpacing","textTransform","color","lineHeight","alignItems","justifyContent","textAlign","gridTemplateColumns","flexWrap","overflow","textWrap","whiteSpace"];
const dump=await p.evaluate((BOX)=>{
  const cs=(el)=>{const c=getComputedStyle(el);const o={};BOX.forEach(k=>{const v=c[k];if(v&&v!=="none"&&v!=="normal"&&v!=="auto"&&v!=="0px"&&v!=="static"&&v!=="rgba(0, 0, 0, 0)"&&v!=="visible"&&v!=="wrap"&&!/^0px none/.test(v))o[k]=v;});return o;};
  const walk=(root)=>{const out=[];const rec=(el,d)=>{const r=el.getBoundingClientRect();
    const own=[...el.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent.trim()).filter(Boolean).join(" ");
    out.push({d,tag:el.tagName.toLowerCase(),text:own,w:+r.width.toFixed(1),h:+r.height.toFixed(1),css:cs(el)});
    [...el.children].forEach(c=>rec(c,d+1));};rec(root,0);return out;};
  const res={};
  [...document.querySelectorAll("[id]")].filter(e=>/^i\d+$/.test(e.id)).forEach(e=>{
    res[e.id]={h:+e.getBoundingClientRect().height.toFixed(1),text:e.innerText,tree:walk(e),html:e.outerHTML};});
  return res;},BOX);
fs.writeFileSync(`${OUT}/literals-open.json`,JSON.stringify(dump,null,1));
for(const id of Object.keys(dump)){
  const el=await p.$("#"+id); if(!el) continue;
  await el.evaluate(e=>e.scrollIntoView({block:"center"})); await new Promise(r=>setTimeout(r,400));
  await el.screenshot({path:`${OUT}/proto-${id}-open.png`});
}
await p.screenshot({path:`${OUT}/proto-institutional-full-open.png`,fullPage:true});
console.log(JSON.stringify(Object.fromEntries(Object.entries(dump).map(([k,v])=>[k,v.h]))));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
