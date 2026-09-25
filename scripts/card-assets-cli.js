import {copyFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCardAssets} from './card-assets.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'../cards');
const [action,version]=process.argv.slice(2);
if(action==='use'){
  if(!/^v\d+\.\d+\.\d+$/.test(version||''))throw Error('请提供版本号，例如 npm run assets:use -- v1.0.0');
  const source=join(root,'releases',`${version}.csv`);
  if(!existsSync(source))throw Error(`找不到素材版本 ${version}`);
  copyFileSync(source,join(root,'assets.csv'));
}else if(action!=='check')throw Error('用法：node scripts/card-assets-cli.js check | use v1.0.0');
const {manifest,files}=loadCardAssets();
console.log(`素材 ${manifest.version} 已校验：${Object.keys(manifest.cards).length} 张卡，网页图片 ${files.size} 个`);
