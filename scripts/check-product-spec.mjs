import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const build=JSON.parse(readFileSync(join(root,'docs/product-spec-build.json')));
const shots=JSON.parse(readFileSync(join(root,'docs/product-spec-assets/manifest.json')));
const hash=path=>{
  const source=join(root,path);
  const fallback=path==='cloud-site/card-assets.js'?join(root,'card-assets.js'):source;
  const file=existsSync(source)?source:fallback;
  return existsSync(file)?createHash('sha256').update(readFileSync(file)).digest('hex'):null;
};
const stale=[];
for(const [path,value] of Object.entries(build.sourceHashes))if(hash(path)!==value)stale.push(path);
for(const [path,value] of Object.entries(build.imageHashes))if(hash(path)!==value)stale.push(path);
for(const [path,value] of Object.entries(shots.sourceHashes))if(hash(path)!==value)stale.push(`截图来源 ${path}`);
if(!existsSync(join(root,build.output)))stale.push(build.output);
if(stale.length){console.error('产品设计图文稿需要同步更新：\n'+stale.map(path=>`- ${path}`).join('\n'));process.exitCode=1;}
else console.log(`产品设计图文稿与当前规则、界面一致：${build.imageCount} 张截图及 PDF。`);
