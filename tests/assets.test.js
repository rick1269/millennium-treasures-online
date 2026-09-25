import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCardAssets} from '../scripts/card-assets.js';
import {ERAS,COPIES,card} from '../web/catalog.js';

test('CSV 素材完整覆盖 81 张规则卡，并保持版本化图片路径',()=>{
  const {manifest,files}=loadCardAssets();
  const expected=ERAS.flatMap(([era])=>COPIES.flatMap((count,i)=>Array.from({length:count},(_,j)=>card(era,i+1,j+1).id)));
  assert.equal(expected.length,81);
  assert.deepEqual(Object.keys(manifest.cards),expected);
  assert.match(manifest.version,/^v\d+\.\d+\.\d+$/);
  for(const url of Object.values(manifest.cards)){
    if(url)assert.match(url,new RegExp(`^\\./assets/${manifest.version}/\\d{3}\\.(png|jpg|jpeg|webp|svg)$`));
  }
  assert.ok(files.size>=1);
});
