import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_SOURCES,LICENSE_TIERS,filterAssetSources,createLocalInventory} from '../web/asset-catalog-data.mjs';

test('curated source list distinguishes CC0, item-by-item, and conflict without blanket approvals',()=>{
  assert.ok(ASSET_SOURCES.length>=8);
  assert.deepEqual(Object.keys(LICENSE_TIERS),['cc0','review','hold']);
  assert.equal(ASSET_SOURCES.find(s=>s.id==='quaternius').tier,'hold');
  assert.equal(ASSET_SOURCES.find(s=>s.id==='kaykit-adventurers').tier,'cc0');
  assert.equal(ASSET_SOURCES.find(s=>s.id==='fab').tier,'review');
  assert.ok(ASSET_SOURCES.every(s=>/^https:\/\//.test(s.url)&&/^https:\/\//.test(s.licenseUrl)));
  assert.equal(new Set(ASSET_SOURCES.map(s=>s.id)).size,ASSET_SOURCES.length);
});
test('search and rights filters never include HOLD under CC0',()=>{
  assert.ok(filterAssetSources('3D').length>0);
  assert.deepEqual(filterAssetSources('QuAtErNiUs').map(s=>s.id),['quaternius']);
  assert.ok(filterAssetSources('','cc0').every(s=>s.tier==='cc0'));
  assert.equal(filterAssetSources('quaternius','cc0').length,0);
  assert.equal(filterAssetSources('zzzzz').length,0);
});
test('self-declared local inventory stays UNKNOWN even with a real checksum',()=>{
  const sha='a'.repeat(64);
  const m=createLocalInventory('sample.glb',1024,sha);
  assert.equal(m.project_id,'aldol_catalog_local');
  assert.deepEqual(m.assets,[{id:'local_'+sha.slice(0,20),file:'assets/sample.glb',byte_size:1024,sha256:sha,status:'UNKNOWN'}]);
  assert.equal(createLocalInventory('texture.png',32,sha).assets[0].status,'UNKNOWN');
});
test('manifest generator rejects unsafe paths, types, sizes and hashes',()=>{
  for(const name of ['../evil.glb','foo.jpg','bad name.glb','../bad.png','a..b.glb']){
    assert.throws(()=>createLocalInventory(name,100,'a'.repeat(64)));
  }
  for(const size of [0,-1,20*1024*1024+1,NaN]){
    assert.throws(()=>createLocalInventory('safe.glb',size,'a'.repeat(64)));
  }
  assert.throws(()=>createLocalInventory('safe.glb',4,'no-hash'));
});
