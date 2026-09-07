import type { Page } from "playwright";
import type { UiAuditIssue } from "../../shared/types/ui-audit";

export interface CollectedUiAuditArtifact { sourceId: string; state: string; width: number; height: number; bytes: Buffer; }
export interface CollectedUiAudit { issues: Omit<UiAuditIssue, "id">[]; artifacts: CollectedUiAuditArtifact[]; }

const inspectUiStateScript = String.raw`(currentState => {
  const issues = [];
  const selector = element => {
    if (element.id) return '#' + CSS.escape(element.id);
    const testId = element.getAttribute('data-testid');
    if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
    const parts = []; let current = element;
    while (current && current !== document.body && parts.length < 4) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement ? [...current.parentElement.children].filter(item => item.tagName === current.tagName) : [];
      parts.unshift(siblings.length > 1 ? tag + ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : tag);
      current = current.parentElement;
    }
    return parts.join(' > ') || element.tagName.toLowerCase();
  };
  const add = (rule, severity, title, message, element, actual) => issues.push({ rule, severity, title, message, selector: selector(element), state: currentState, actual });
  const visible = element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0; };
  const directText = element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim());
  const visuallyHidden = (element, style=getComputedStyle(element), rect=element.getBoundingClientRect()) => rect.width <= 1.5 && rect.height <= 1.5 && [style.overflow,style.overflowX,style.overflowY].some(value => ['hidden','clip'].includes(value));
  const rgb = value => { const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/); return match ? { r:Number(match[1]), g:Number(match[2]), b:Number(match[3]), a:match[4] === undefined ? 1 : Number(match[4]) } : undefined; };
  const background = element => {
    let current = element; let uncertain = false;
    while (current) {
      const style = getComputedStyle(current);
      if (style.backgroundImage && style.backgroundImage !== 'none') return undefined;
      const color = rgb(style.backgroundColor);
      if (color && color.a > .95) return uncertain ? undefined : color;
      if (current !== element && ['fixed','absolute','sticky'].includes(style.position)) uncertain = true;
      current = current.parentElement;
    }
    return undefined;
  };
  const luminance = color => { const values = [color.r,color.g,color.b].map(value => { const channel=value/255; return channel <= .03928 ? channel/12.92 : ((channel+.055)/1.055)**2.4; }); return .2126*values[0] + .7152*values[1] + .0722*values[2]; };
  const contrast = (first, second) => { const values=[luminance(first),luminance(second)].sort((a,b)=>b-a); return (values[0]+.05)/(values[1]+.05); };
  const root = document.documentElement;
  if (root.scrollWidth > innerWidth + 1) add('horizontal_overflow','high','페이지에 가로 넘침이 있습니다.','콘텐츠 너비가 화면보다 ' + (root.scrollWidth-innerWidth) + 'px 큽니다.',root,{viewportWidth:innerWidth,documentWidth:root.scrollWidth,overflowPixels:root.scrollWidth-innerWidth});
  const elements = [...document.body.querySelectorAll('*')].filter(visible).slice(0,1200);
  for (const element of elements) {
    const style=getComputedStyle(element); const rect=element.getBoundingClientRect();
    const clippedX=['hidden','clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    const clippedY=['hidden','clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    if ((clippedX || clippedY) && directText(element) && !visuallyHidden(element,style,rect)) add('clipped_content','medium','콘텐츠가 영역 안에서 잘릴 수 있습니다.','요소의 실제 콘텐츠 크기가 표시 영역보다 큽니다.',element,{clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight});
    if (element.matches('a[href],button,input,select,textarea,[role=button]') && style.display !== 'inline' && !visuallyHidden(element,style,rect) && (rect.width < 24 || rect.height < 24)) add('small_target','low','클릭 영역이 작습니다.','포인터 입력 영역이 24×24px보다 작습니다.',element,{width:Math.round(rect.width),height:Math.round(rect.height),minimum:24});
  }
  for (const element of elements.filter(item => item.matches('a[href],button,input,select,textarea,[role=button],h1,h2,h3')).slice(0,300)) {
    const rect=element.getBoundingClientRect(); const style=getComputedStyle(element);
    if (visuallyHidden(element,style,rect)) continue;
    const x=rect.left+rect.width/2; const y=rect.top+rect.height/2;
    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) continue;
    const top=document.elementFromPoint(x,y); const coveringLink=top?.closest('a[href],[role=link]'); const container=element.closest('li,article');
    const cardOverlay=element.matches('h1,h2,h3') && coveringLink && !(coveringLink.textContent || '').trim() && !coveringLink.getAttribute('aria-label') && container && coveringLink.closest('li,article') === container;
    if (top && top !== element && !element.contains(top) && !top.contains(element) && !cardOverlay) add('element_overlap','high','요소가 다른 UI에 가려졌습니다.','대상 요소의 중앙 지점에 다른 요소가 표시됩니다.',element,{coveringSelector:selector(top),x:Math.round(x),y:Math.round(y)});
  }
  for (const element of elements.filter(item => !item.matches('script,style,svg,path') && [...item.childNodes].some(node => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim())).slice(0,400)) {
    const style=getComputedStyle(element); const foreground=rgb(style.color); const backgroundColor=background(element); if (!foreground || foreground.a < .95 || !backgroundColor) continue; const ratio=contrast(foreground,backgroundColor); const size=parseFloat(style.fontSize); const large=size>=24 || size>=18.66 && Number(style.fontWeight)>=700; const required=large?3:4.5;
    if (ratio + .05 < required) add('low_contrast','medium','텍스트 명암 대비가 부족합니다.','텍스트와 배경의 대비가 권장 기준 ' + required + ':1보다 낮습니다.',element,{ratio:Number(ratio.toFixed(2)),required,fontSize:size});
  }
  return issues.slice(0,100);
})`;

export async function inspectUiState(page: Page, state: string): Promise<Omit<UiAuditIssue, "id">[]> {
  return page.evaluate(`${inspectUiStateScript}(${JSON.stringify(state)})`) as Promise<Omit<UiAuditIssue, "id">[]>;
}
export async function collectUiAuditPage(page: Page, targetUrl: string, viewport: { width:number; height:number }): Promise<CollectedUiAudit> {
  await page.setViewportSize(viewport); await page.goto(targetUrl, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForLoadState("networkidle", { timeout:5000 }).catch(() => undefined); await page.waitForTimeout(500);
  const states = [{ name:"initial", ratio:0 },{ name:"scroll_25", ratio:.25 },{ name:"scroll_50", ratio:.5 },{ name:"scroll_75", ratio:.75 },{ name:"scroll_100", ratio:1 },{ name:"scroll_up", ratio:.65 }];
  const issues: Omit<UiAuditIssue,"id">[]=[]; const artifacts: CollectedUiAuditArtifact[]=[]; const seen=new Set<string>();
  for (const state of states) {
    await page.evaluate((ratio) => scrollTo({ top:Math.max(0,(document.documentElement.scrollHeight-innerHeight)*ratio), behavior:"instant" }), state.ratio); await page.waitForTimeout(250);
    const sourceId=`ui-${state.name}`; const stateIssues=await inspectUiState(page,state.name); const bytes=Buffer.from(await page.screenshot({ type:"png", fullPage:false, animations:"disabled" }));
    artifacts.push({ sourceId,state:state.name,width:viewport.width,height:viewport.height,bytes });
    for (const issue of stateIssues) { const fingerprint=`${issue.rule}:${issue.selector}`; if (seen.has(fingerprint)) continue; seen.add(fingerprint); issues.push({ ...issue, artifactSourceId:sourceId }); }
  }
  return { issues:issues.slice(0,100), artifacts };
}
