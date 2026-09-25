import {readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {stageCardAssets} from './card-assets.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(join(root,'cloud-public.json'),'utf8'));
const url=new URL(config.url);
if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||!/^sb_publishable_/.test(config.key)){
  throw new Error('cloud-public.json 需要有效的 Supabase URL 和 publishable key');
}
const output=join(root,'cloud-site');
mkdirSync(output,{recursive:true});
for(const file of ['index.html','manual.html','auction-flow-v2-revised.png','app.js','style.css','favicon.svg'])copyFileSync(join(root,'web',file),join(output,file));
if(process.argv.includes('--stable'))copyFileSync(join(root,'web','stable-app.js'),join(output,'app.js'));
rmSync(join(output,'assets'),{recursive:true,force:true});
const assets=stageCardAssets(output);
writeFileSync(join(output,'cloud-config.js'),`window.GAME_CLOUD_CONFIG = ${JSON.stringify({url:url.origin,key:config.key})};\n`);
const fingerprint=file=>createHash('sha256').update(readFileSync(join(output,file))).digest('hex').slice(0,10);
let html=readFileSync(join(root,'web','index.html'),'utf8');
for(const file of ['style.css','card-assets.js','app.js']){
  html=html.replace(new RegExp(`\\./${file.replace('.','\\.')}\\?[^"']*|\\./${file.replace('.','\\.')}`,'g'),`./${file}?v=${fingerprint(file)}`);
}
writeFileSync(join(output,'index.html'),html);
writeFileSync(join(output,'404.html'),html);
console.log(`网页构建完成：${output}，素材 ${assets.manifest.version}，${assets.files.size} 个图片文件`);
