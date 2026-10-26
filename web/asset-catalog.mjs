import {ASSET_SOURCES,LICENSE_TIERS,filterAssetSources} from './asset-catalog-data.mjs';

const container=document.getElementById('asset-catalog-results');
const search=document.getElementById('asset-catalog-search');
const tier=document.getElementById('asset-catalog-tier');
const count=document.getElementById('asset-catalog-count');
const picked=document.getElementById('asset-catalog-selected');
let selectedId=null;
const element=(tag,className,content)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(content!==undefined)node.textContent=content;
  return node;
};
function external(label,url){
  const a=element('a','catalog-external',label);
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  return a;
}
function render(){
 if(!container)return;
 const rows=filterAssetSources(search?.value||'',tier?.value||'all');
 count.textContent=rows.length+' / '+ASSET_SOURCES.length+'개 출처';
 container.replaceChildren();
 if(!rows.length){container.append(element('p','catalog-empty','검색 결과가 없습니다.'));return;}
 for(const source of rows){
  const card=element('article','catalog-card'+(selectedId===source.id?' selected':''));
  const heading=element('div','catalog-card-heading');
  const title=element('strong','',source.name);
  const label=element('span','catalog-tier '+source.tier,LICENSE_TIERS[source.tier]);
  heading.append(title,label);
  const kind=element('p','catalog-kind',source.category+' · '+source.format);
  const desc=element('p','catalog-description',source.summary);
  const actions=element('div','catalog-actions');
  const choose=element('button','catalog-choose','이 출처로 등록 준비');
  choose.type='button';choose.setAttribute('aria-pressed',String(selectedId===source.id));
  choose.addEventListener('click',()=>{
   selectedId=source.id;
   picked.textContent=source.name+' 선택됨. 원본 사이트에서 파일별 이용 조건을 확인한 뒤, 아래 GLB/PNG 파일을 직접 선택하세요. 라이선스 승인은 자동으로 처리되지 않습니다.';
   window.dispatchEvent(new CustomEvent('studio:asset-source-selected',{detail:{id:source.id,name:source.name,tier:source.tier}}));
   render();
  });
  actions.append(external('공식 사이트',source.url),external('라이선스 근거',source.licenseUrl),choose);
  card.append(heading,kind,desc,actions);container.append(card);
 }
}
if(container){
 search?.addEventListener('input',render);
 tier?.addEventListener('change',render);
 render();
}
