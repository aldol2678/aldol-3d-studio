import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const env={...process.env,INHA_WORLD_EDITOR_DIR:resolve('compat/inha-editor')};
for(const suite of ['tests/real.test.mjs','tests/factory-real-p2.mjs']){
  const result=spawnSync(process.execPath,['--test',suite],{stdio:'inherit',env});
  if(result.status!==0)process.exit(result.status??1);
}
