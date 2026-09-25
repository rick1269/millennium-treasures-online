import {copyFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const destination=join(root,'supabase','functions','_shared');
mkdirSync(destination,{recursive:true});
for(const file of ['game.js','catalog.js'])copyFileSync(join(root,'web',file),join(destination,file));
console.log('游戏规则引擎已同步到 Supabase Edge Function');
