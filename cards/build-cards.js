import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {ERAS,COPIES,BASE,card} from '../web/catalog.js';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'print');mkdirSync(out,{recursive:true});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const csv=[['id','时代','星级','卡名','副本','基础估值','红卡','印刷数量'].join(',')];
for(const [era] of ERAS){
 const folder=join(out,era);mkdirSync(folder,{recursive:true});
 for(let star=1;star<=4;star++)for(let copy=1;copy<=COPIES[star-1];copy++){
  const c=card(era,star,copy),red=star===4,border=red?'#ad5147':'#a7804f',accent=red?'#d38070':'#d6b075';
  const title=c.name.length>8?20:c.name.length>5?24:30;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="63mm" height="88mm" viewBox="0 0 630 880">
<defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="${red?'#3e2523':'#343027'}"/><stop offset="1" stop-color="#171816"/></linearGradient><pattern id="grain" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="4" r="1" fill="#e9d7ab" opacity=".14"/><circle cx="17" cy="21" r="1" fill="#e9d7ab" opacity=".12"/></pattern></defs>
<rect width="630" height="880" rx="28" fill="url(#paper)"/><rect width="630" height="880" rx="28" fill="url(#grain)"/><rect x="22" y="22" width="586" height="836" rx="17" fill="none" stroke="${border}" stroke-width="4"/><rect x="36" y="36" width="558" height="808" rx="10" fill="none" stroke="${border}" opacity=".5" stroke-width="2"/>
<text x="64" y="105" fill="${accent}" font-family="PingFang SC, Noto Serif CJK SC, serif" font-size="27" letter-spacing="5">${esc(era)}</text><text x="570" y="105" fill="${accent}" font-family="serif" font-size="26" text-anchor="end">${'★'.repeat(star)}</text>
<circle cx="315" cy="350" r="181" fill="none" stroke="${border}" opacity=".28" stroke-width="3"/><circle cx="315" cy="350" r="152" fill="none" stroke="${border}" opacity=".22" stroke-width="2"/><path d="M120 350h390 M315 158v385 M183 218l264 264 M447 218L183 482" stroke="${border}" opacity=".13" stroke-width="3"/>
<text x="315" y="443" fill="${accent}" opacity=".34" font-family="PingFang SC, Noto Serif CJK SC, serif" font-size="220" text-anchor="middle">${esc(era.slice(0,1))}</text>
<text x="315" y="617" fill="#f3e5cf" font-family="PingFang SC, Noto Serif CJK SC, serif" font-size="${title}" font-weight="700" text-anchor="middle">${esc(c.name)}</text>
<path d="M75 668h480" stroke="${border}" stroke-width="2"/><text x="75" y="729" fill="${accent}" font-family="PingFang SC, sans-serif" font-size="25">${red?'传奇藏品 · 红卡':'时代藏品'}</text><text x="555" y="733" fill="#f3e5cf" font-family="serif" font-size="37" text-anchor="end">${BASE[star]} 金</text>
<text x="75" y="810" fill="#b7a88d" font-family="sans-serif" font-size="17">千年藏珍 · 基础版</text><text x="555" y="810" fill="#b7a88d" font-family="sans-serif" font-size="17" text-anchor="end">${esc(c.id)}</text></svg>`;
  writeFileSync(join(folder,`${star}星-${String(copy).padStart(2,'0')}-${c.name}.svg`),svg);
  csv.push([c.id,era,star,c.name,copy,c.base,red?'是':'否',1].join(','));
 }
}
writeFileSync(join(root,'catalog.csv'),'\uFEFF'+csv.join('\n')+'\n');
writeFileSync(join(out,'通用卡背.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="63mm" height="88mm" viewBox="0 0 630 880"><rect width="630" height="880" rx="28" fill="#22231f"/><rect x="22" y="22" width="586" height="836" rx="17" fill="none" stroke="#bd8d55" stroke-width="5"/><rect x="40" y="40" width="550" height="800" rx="8" fill="none" stroke="#765a3d" stroke-width="2"/><circle cx="315" cy="440" r="176" fill="none" stroke="#8b6a45" stroke-width="5"/><circle cx="315" cy="440" r="150" fill="none" stroke="#8b6a45" stroke-width="2"/><text x="315" y="485" fill="#d6b075" font-family="PingFang SC, Noto Serif CJK SC, serif" font-size="120" text-anchor="middle">藏</text><text x="315" y="714" fill="#d6b075" font-family="PingFang SC, serif" font-size="35" letter-spacing="8" text-anchor="middle">千年藏珍</text></svg>`);
console.log(`已生成 ${csv.length-1} 张卡面、1 张通用卡背。`);
