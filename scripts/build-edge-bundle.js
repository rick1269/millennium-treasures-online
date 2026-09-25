import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const catalog=read('web/catalog.js').replace(/^export /gm,'');
const game=read('web/game.js')
  .replace("import { randomBytes } from 'node:crypto';",'')
  .replace("import { ERAS, deckFor } from './catalog.js';",'')
  .replace(/^export /gm,'');
const handler=read('supabase/functions/game/handler.js')
  .replace("import {createGame,joinGame,act,advanceBots,publicView} from '../_shared/game.js';",'')
  .replace("import {createHash} from 'node:crypto';",'')
  .replace(/^export /gm,'');
const entry=read('supabase/functions/game/index.ts')
  .replace("import { createHandler } from './handler.js';",'');
const output=join(root,'supabase','edge-bundle');
mkdirSync(output,{recursive:true});
writeFileSync(join(output,'index.ts'),`import { randomBytes, createHash } from 'node:crypto';\n\n${catalog}\n${game}\n${handler}\n${entry}`);
console.log(`单文件 Edge Function 已构建：${join(output,'index.ts')}`);
