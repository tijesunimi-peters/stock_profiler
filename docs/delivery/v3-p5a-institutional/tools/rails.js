// Ground truth for the two rails that flank the prototype's content column:
// the left rail's SECTIONS jump list and the right rail's FILING TIMELINE.
const fs=require("fs"); const puppeteer=require("puppeteer");
const click=async(p,t)=>p.evaluate((t)=>{const e=[...document.querySelectorAll("button,a,[role=button],div,span,li")].find(e=>(e.innerText||"").trim()===t&&e.offsetParent!==null);if(!e)return false;e.click();return true},t);
const BOX=["display","flexDirection","gap","rowGap","columnGap","padding","margin","backgroundColor","border","borderTop","borderBottom","borderLeft","borderRadius","boxShadow","fontFamily","fontSize","fontWeight","letterSpacing","textTransform","color","lineHeight","alignItems","justifyContent","textAlign","width","height","position","top","flexWrap","overflow"];
(async()=>{const b=await puppeteer.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});const p=await b.newPage();
await p.setViewport({width:1440,height:1400,deviceScaleFactor:2});
await p.goto("http://proto-srv:9000/prototype.dc.html",{waitUntil:"networkidle0",timeout:120000});await new Promise(r=>setTimeout(r,2500));
await click(p,"Companies");await new Promise(r=>setTimeout(r,1200));
await click(p,"Institutional");await new Promise(r=>setTimeout(r,2200));
const res=await p.evaluate((BOX)=>{
  const col=document.getElementById("i1");
  let node=col,row=null;
  while(node&&node.parentElement){const par=node.parentElement;
    if(getComputedStyle(par).display==="flex"&&par.children.length>1){
      const sibs=[...par.children].filter(c=>c!==node);
      if(sibs.length&&sibs[0].getBoundingClientRect().width>100){row={par,me:node,sibs};break;}
    } node=par;}
  const cs=(el)=>{const c=getComputedStyle(el);const o={};BOX.forEach(k=>{const v=c[k];if(v&&v!=="none"&&v!=="normal"&&v!=="auto"&&v!=="0px"&&v!=="static"&&v!=="rgba(0, 0, 0, 0)"&&!/^0px none/.test(v))o[k]=v;});return o;};
  const walk=(root)=>{const out=[];const rec=(el,d)=>{const r=el.getBoundingClientRect();
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(" ");
    out.push({d,tag:el.tagName.toLowerCase(),text:own,w:+r.width.toFixed(1),h:+r.height.toFixed(1),css:cs(el)});
    [...el.children].forEach(c=>rec(c,d+1));};rec(root,0);return out;};
  const out={rowCss:cs(row.par),rowW:row.par.getBoundingClientRect().width};
  out.parts=row.sibs.map((s,i)=>({i,w:+s.getBoundingClientRect().width.toFixed(1),tree:walk(s),html:s.outerHTML}));
  // the SECTIONS list lives in the LEFT rail, which is a sibling of the whole row -- find it by text
  const secHost=[...document.querySelectorAll("*")].find(e=>/^SECTIONS/m.test(e.innerText||"")&&e.children.length&&e.getBoundingClientRect().width<260&&[...e.children].every(c=>c.getBoundingClientRect().width<260));
  if(secHost) out.sections={w:+secHost.getBoundingClientRect().width.toFixed(1),tree:walk(secHost),html:secHost.outerHTML};
  return out;
},BOX);
fs.writeFileSync("/out/rails.json",JSON.stringify(res,null,1));
// screenshots of each rail
const shot=async(pred,name)=>{const h=await p.evaluateHandle((t)=>{
  const col=document.getElementById("i1");let n=col;
  while(n&&n.parentElement){const par=n.parentElement;
    if(getComputedStyle(par).display==="flex"&&par.children.length>1){const s=[...par.children].filter(c=>c!==n);
      if(s.length&&s[0].getBoundingClientRect().width>100)return t==="right"?s[s.length-1]:s[0];}
    n=par;} return null;},pred);
  const el=h.asElement(); if(el) await el.screenshot({path:`/out/${name}`});};
await shot("right","proto-rail-right.png");
console.log(JSON.stringify({rowW:res.rowW,parts:res.parts.map(x=>({i:x.i,w:x.w})),sections:res.sections&&res.sections.w},null,1));
await b.close()})().catch(e=>{console.error(e);process.exit(1)});
