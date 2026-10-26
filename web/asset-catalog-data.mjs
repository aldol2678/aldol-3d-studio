// Curated source directory, not a claim that every downloadable file is cleared.
// References: NARU free-asset survey v2.1 (2026-10-26), ION/MOA cross-check.
// Keep licenses tied to specific packs/models, not whole marketplaces.
export const ASSET_SOURCES = Object.freeze([
  {
    id:'kenney', name:'Kenney', category:'3D · UI · 게임 소품', tier:'cc0',
    summary:'CC0 에셋. 원본 파일별 형식과 크기는 가져오기 단계에서 확인합니다.',
    url:'https://kenney.nl/assets', licenseUrl:'https://kenney.nl/support',
    format:'GLB 여부는 팩별 확인'
  },
  {
    id:'polyhaven', name:'Poly Haven', category:'3D · HDRI · PBR', tier:'cc0',
    summary:'제공 에셋은 CC0. 사이트 로고·예제 렌더는 별도 권리입니다.',
    url:'https://polyhaven.com', licenseUrl:'https://polyhaven.com/license',
    format:'GLB · 이미지 등 품목별'
  },
  {
    id:'ambientcg', name:'ambientCG', category:'PBR 재질 · 텍스처', tier:'cc0',
    summary:'CC0 재질. 스튜디오는 현재 PNG만 직접 등록하며 압축 텍스처는 별도 변환이 필요합니다.',
    url:'https://ambientcg.com', licenseUrl:'https://docs.ambientcg.com/license/',
    format:'PNG만 현재 등록 지원'
  },
  {
    id:'kaykit-adventurers', name:'KayKit Adventurers', category:'캐릭터 · 소품', tier:'cc0',
    summary:'Adventurers 무료판의 CC0 안내 기준. 유료 EXTRA/SOURCE 팩에는 일괄 적용하지 않습니다.',
    url:'https://kaylousberg.itch.io/kaykit-adventurers',
    licenseUrl:'https://kaylousberg.itch.io/kaykit-adventurers', format:'GLB 여부·애니메이션 확인'
  },
  {
    id:'polypizza', name:'Poly Pizza', category:'로우폴리 3D 모델', tier:'review',
    summary:'CC0와 저작자표시(CC BY) 모델이 함께 존재합니다. 모델마다 확인하세요.',
    url:'https://poly.pizza', licenseUrl:'https://poly.pizza/docs/tos',
    format:'모델별 확인'
  },
  {
    id:'sketchfab', name:'Sketchfab', category:'3D 모델', tier:'review',
    summary:'CC0·BY·NC 등 모델별 조건이 다릅니다. 다운로드 허용과 상업 이용은 별개입니다.',
    url:'https://sketchfab.com', licenseUrl:'https://sketchfab.com',
    format:'모델별 확인'
  },
  {
    id:'itch', name:'itch.io Game Assets', category:'2D · 3D · 오디오', tier:'review',
    summary:'제작자·팩마다 라이선스가 다릅니다. 해당 팩의 원문을 직접 확인하세요.',
    url:'https://itch.io/game-assets/free', licenseUrl:'https://itch.io/game-assets/free',
    format:'팩별 확인'
  },
  {
    id:'fab', name:'Fab', category:'3D · 환경 · VFX', tier:'review',
    summary:'무료 취득과 CC0는 다릅니다. Standard 등은 에셋 단독 재배포가 제한됩니다.',
    url:'https://www.fab.com/limited-time-free', licenseUrl:'https://www.fab.com/eula',
    format:'UE/Unity 전용은 변환 필요'
  },
  {
    id:'quaternius', name:'Quaternius', category:'3D · 애니메이션', tier:'hold',
    summary:'일부 팩은 CC0, 공식 QAL v1.0은 재배포 제한. 팩·버전·취득 시점별 권리 확인 전 보류.',
    url:'https://quaternius.com', licenseUrl:'https://quaternius.com/license.html',
    format:'팩별 확인'
  }
]);
export const LICENSE_TIERS = Object.freeze({
  cc0:'CC0 근거 확인',
  review:'파일별 확인',
  hold:'권리 충돌 · 보류'
});
export function filterAssetSources(query='',tier='all'){
  const keyword=String(query).trim().toLocaleLowerCase('ko');
  return ASSET_SOURCES.filter(s=>(tier==='all'||s.tier===tier)&&
    (!keyword||[s.name,s.category,s.summary,s.format].some(v=>v.toLocaleLowerCase('ko').includes(keyword))));
}
export function createLocalInventory(filename,size,sha256){
  // This is a SELF-DECLARED integrity handoff, not an Asset Factory MCP PASS.
  if(typeof filename!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.(?:glb|png)$/i.test(filename)||filename.includes('..'))
    throw Error('E_LOCAL_FILE_NAME');
  if(!Number.isSafeInteger(size)||size<1||size>20*1024*1024)throw Error('E_LOCAL_FILE_SIZE');
  if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256))throw Error('E_LOCAL_SHA256');
  return {project_id:'aldol_catalog_local',assets:[{
    id:'local_'+sha256.slice(0,20),file:'assets/'+filename,byte_size:size,sha256,status:'UNKNOWN'
  }]};
}
