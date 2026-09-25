import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const candidates=[process.env.PRODUCT_SPEC_PYTHON,
 '/Users/rickqiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
 'python3'].filter(Boolean);
let python;
for(const name of candidates){
 if(name.includes('/')&&!existsSync(name))continue;
 const probe=spawnSync(name,['-c','import reportlab, PIL'],{stdio:'ignore'});
 if(probe.status===0){python=name;break;}
}
if(!python){console.error('PDF 构建需要 Python 的 reportlab 与 Pillow。可用 PRODUCT_SPEC_PYTHON 指定已安装依赖的解释器。');process.exit(1);}
const result=spawnSync(python,[join(root,'scripts/build-product-spec.py')],{stdio:'inherit',cwd:root});
process.exit(result.status??1);
