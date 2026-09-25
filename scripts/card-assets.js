import {copyFileSync,existsSync,mkdirSync,readFileSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const cardRoot=join(root,'cards');
const activeFile=join(cardRoot,'assets.csv');
const releaseRoot=join(cardRoot,'releases');
const allowedExt=new Set(['.png','.jpg','.jpeg','.webp','.svg']);

function parseCsv(source){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quoted){if(c==='"'&&source[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
    else if(c==='"')quoted=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw Error('素材 CSV 中有未关闭的引号');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows;
}

function safeSource(value){
  if(!value)return null;
  if(value.startsWith('/')||value.includes('\\')||value.split('/').includes('..')||value.includes('?')||value.includes('#'))throw Error(`素材路径必须是 cards/ 内的相对路径：${value}`);
  const full=resolve(cardRoot,value);
  if(!full.startsWith(cardRoot+sep)||!existsSync(full)||!statSync(full).isFile()||!realpathSync(full).startsWith(cardRoot+sep))throw Error(`素材文件不存在或超出 cards/：${value}`);
  if(!allowedExt.has(extname(full).toLowerCase()))throw Error(`不支持的图片格式：${value}`);
  return full;
}

export function loadCardAssets(){
  const source=readFileSync(activeFile,'utf8').replace(/^\uFEFF/,'');
  const rows=parseCsv(source);
  if(JSON.stringify(rows.shift())!==JSON.stringify(['id','web_image','art_image']))throw Error('cards/assets.csv 表头必须是 id,web_image,art_image');
  const catalog=parseCsv(readFileSync(join(cardRoot,'catalog.csv'),'utf8').replace(/^\uFEFF/,''));
  catalog.shift();const ids=catalog.map(row=>row[0]);
  const items=new Map();
  for(const row of rows){
    if(row.length!==3||!row[0]||items.has(row[0]))throw Error(`素材 CSV 行格式错误或 ID 重复：${row[0]||'(空)'}`);
    items.set(row[0],{web:row[1],art:row[2]});
  }
  const version=items.get('@version')?.web;
  if(!/^v\d+\.\d+\.\d+$/.test(version||''))throw Error('素材版本号须为 v主.次.修订，例如 v1.1.0');
  const expected=new Set([...ids,'@version','@back','@overview']);
  for(const id of expected)if(!items.has(id))throw Error(`素材 CSV 缺少 ${id}`);
  for(const id of items.keys())if(!expected.has(id))throw Error(`素材 CSV 中有未知 ID：${id}`);
  if(items.get('@version').art)throw Error('@version 的 art_image 必须留空');
  const releaseFile=join(releaseRoot,`${version}.csv`);
  const checksumFile=join(releaseRoot,`${version}.sha256.json`);
  mkdirSync(releaseRoot,{recursive:true});
  if(existsSync(releaseFile)){
    const archived=parseCsv(readFileSync(releaseFile,'utf8').replace(/^\uFEFF/,''));
    if(JSON.stringify(archived)!==JSON.stringify(parseCsv(source)))throw Error(`版本 ${version} 已归档；修改路径前请先在 @version 行升级版本号`);
  }else writeFileSync(releaseFile,source);
  const archivedChecksums=existsSync(checksumFile)?JSON.parse(readFileSync(checksumFile,'utf8')):null;
  const files=new Map(),cards={},sourceHashes=new Map();
  const checkedPath=(value,publishedName)=>{
    if(!value)return null;
    if(value.startsWith('/')||value.includes('\\')||value.split('/').includes('..')||value.includes('?')||value.includes('#'))throw Error(`素材路径必须是 cards/ 内的相对路径：${value}`);
    if(!allowedExt.has(extname(value).toLowerCase()))throw Error(`不支持的图片格式：${value}`);
    const original=resolve(cardRoot,value);
    if(existsSync(original)){
      const full=safeSource(value);
      sourceHashes.set(value,createHash('sha256').update(readFileSync(full)).digest('hex'));
      return full;
    }
    const archivedHash=archivedChecksums?.[value];
    if(!archivedHash)throw Error(`素材文件不存在且无归档校验值：${value}`);
    sourceHashes.set(value,archivedHash);
    if(!publishedName)return null;
    const published=join(root,'assets',version,publishedName);
    if(!existsSync(published)||!statSync(published).isFile())throw Error(`已发布的卡面不存在：${published}`);
    const actual=createHash('sha256').update(readFileSync(published)).digest('hex');
    if(actual!==archivedHash)throw Error(`已发布卡面与归档校验值不一致：${published}`);
    return published;
  };
  const add=(id,index)=>{
    const path=items.get(id).web;
    if(!path)return null;
    const name=`${index}${extname(path).toLowerCase()}`,full=checkedPath(path,name);
    files.set(name,full);
    return `./assets/${version}/${name}`;
  };
  ids.forEach((id,i)=>{cards[id]=add(id,String(i+1).padStart(3,'0'));checkedPath(items.get(id).art);});
  const back=add('@back','back'),overview=add('@overview','overview');
  checkedPath(items.get('@back').art);checkedPath(items.get('@overview').art);
  const checksums=Object.fromEntries([...sourceHashes].sort(([a],[b])=>a<b?-1:a>b?1:0));
  if(existsSync(checksumFile)){
    if(JSON.stringify(JSON.parse(readFileSync(checksumFile,'utf8')))!==JSON.stringify(checksums))throw Error(`版本 ${version} 的图片内容已改变；请恢复原文件，或使用新文件路径和新版本号`);
  }else writeFileSync(checksumFile,JSON.stringify(checksums,null,2)+'\n');
  const manifest={version,cards,back,overview};
  return {manifest,files,script:`window.GAME_CARD_ASSETS = ${JSON.stringify(manifest)};\n`};
}

export function stageCardAssets(output){
  const assets=loadCardAssets(),target=join(output,'assets',assets.manifest.version);
  mkdirSync(target,{recursive:true});
  for(const [name,source] of assets.files)copyFileSync(source,join(target,name));
  writeFileSync(join(output,'card-assets.js'),assets.script);
  return assets;
}
