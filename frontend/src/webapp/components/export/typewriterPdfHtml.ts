import { PAGE_W_PX, PAGE_H_PX, PAGE_GAP_PX, inToPx, type Margins } from "../editor/utils/typewriterMargins"
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE_PX, DEFAULT_LINE_HEIGHT } from "../editor/utils/typewriterPrefs"
import hljsCss from "highlight.js/styles/github-dark.css?raw"
import katexCss from "katex/dist/katex.min.css?raw"

export type ExportDocKind = "prose" | "markdown"

export type ExportDoc = {
  title: string
  html: string
  margins: Margins
  kind?: ExportDocKind
}

const GOOGLE_FONTS_IMPORT =
  '@import url("https://fonts.googleapis.com/css2?family=Cabin:wght@400;500;700&family=EB+Garamond:wght@400;500;700&family=Google+Sans+Flex:opsz,wght@8..144,400..700&family=Inter:wght@400;500;700&family=Lato:wght@400;700&family=Montserrat:wght@400;500;700&family=Noto+Emoji:wght@400&family=Noto+Sans:wght@400;500;700&family=Roboto+Mono:wght@400;500;700&display=swap");'

function resolveThemeColors(): { text: string; paper: string } {
  try {
    const root = getComputedStyle(document.documentElement)
    const text = root.getPropertyValue("--editor-text").trim() || "#15110b"
    const paper = root.getPropertyValue("--app-bg").trim() || "#ffffff"
    return { text, paper }
  } catch {
    return { text: "#15110b", paper: "#ffffff" }
  }
}

const EXPORT_DARK_INK = "#15110b"
const NEAR_WHITE_LUMINANCE = 0.65

type Rgb = { r: number; g: number; b: number }

function parseCssColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    let s = hex[1]
    if (s.length === 3) s = s.split("").map((c) => c + c).join("")
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v)
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map((p) => parseFloat(p))
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return { r: parts[0], g: parts[1], b: parts[2] }
    }
  }
  return null
}

function luminance({ r, g, b }: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function isAchromatic({ r, g, b }: Rgb): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) <= 24
}

function ensureDarkInk(color: string): string {
  const rgb = parseCssColor(color)
  if (!rgb) return EXPORT_DARK_INK
  return luminance(rgb) > 0.5 ? EXPORT_DARK_INK : color
}

function remapInlineColorsForWhitePaper(html: string): string {
  if (typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(html, "text/html")

  doc.body.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const bg = parseCssColor(el.style.backgroundColor || "")
    if (bg && isAchromatic(bg) && luminance(bg) >= NEAR_WHITE_LUMINANCE) {
      el.style.backgroundColor = EXPORT_DARK_INK
      el.style.color = EXPORT_DARK_INK
      el.setAttribute("data-pdfx-redact", "1")
    }
  })

  doc.body.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const fg = parseCssColor(el.style.color || "")
    if (!fg || !isAchromatic(fg)) return
    if (el.closest("[data-pdfx-redact]")) {
      el.style.color = EXPORT_DARK_INK
    } else if (luminance(fg) >= NEAR_WHITE_LUMINANCE) {
      el.style.color = EXPORT_DARK_INK
    }
  })

  doc.body.querySelectorAll("[data-pdfx-redact]").forEach((el) => el.removeAttribute("data-pdfx-redact"))
  return doc.body.innerHTML
}

const MARKDOWN_VARS: Array<[name: string, fallback: string]> = [
  ["--app-body-font", "system-ui, -apple-system, sans-serif"],
  ["--app-display-font", "Georgia, 'Times New Roman', serif"],
  ["--editor-text", "#15110b"],
  ["--app-accent", "#9ab8ff"],
  ["--menu-bg", "#1d1d1d"],
  ["--menu-dropdown-border", "#2a2a2a"],
]

function resolveRootVars(inkOverride?: string): string {
  let root: CSSStyleDeclaration | null = null
  try {
    root = getComputedStyle(document.documentElement)
  } catch {
    root = null
  }
  const decls = MARKDOWN_VARS.map(([name, fallback]) => {
    if (name === "--editor-text" && inkOverride) return `${name}:${inkOverride};`
    const live = root ? root.getPropertyValue(name).trim() : ""
    return `${name}:${live || fallback};`
  }).join("")
  return `:root{${decls}}`
}

function contentCss(textColor: string): string {
  return `
.pdfx-prose{
  color:${textColor};
  font-family:${DEFAULT_FONT_FAMILY};
  font-size:${DEFAULT_FONT_SIZE_PX}px;
  line-height:${DEFAULT_LINE_HEIGHT};
  word-break:break-word;
  overflow-wrap:break-word;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  font-feature-settings:"kern" 1,"liga" 1;
  position:relative;
}
.pdfx-prose p{margin-top:0;margin-bottom:1.25em;}
.pdfx-prose p:last-child{margin-bottom:0;}
.pdfx-prose br{margin:0;}
/* Empty paragraphs (consecutive Enter presses) carry no children in getHTML's
   <p></p>, so they'd generate no line box and collapse. The live editor only
   shows them because ProseMirror injects a trailing <br>; that break isn't
   serialized. Force a line box here so each blank line keeps its full
   line-height row, matching the on-screen view and feeding pagination. */
.pdfx-prose p:empty::after{content:"";display:inline-block;}
.pdfx-prose h1{font-size:2em;font-weight:700;margin:12pt 0 4pt;}
.pdfx-prose h2{font-size:1.5em;font-weight:700;margin:12pt 0 4pt;}
.pdfx-prose h3{font-size:1.2em;font-weight:600;margin:12pt 0 4pt;}
.pdfx-prose h4,.pdfx-prose h5,.pdfx-prose h6{font-weight:600;margin:12pt 0 4pt;}
.pdfx-prose ul,.pdfx-prose ol{padding-left:1.5em;margin:0 0 8pt;}
.pdfx-prose blockquote{border-left:3px solid rgba(26,24,20,0.25);padding-left:1em;color:rgba(26,24,20,0.65);margin:0 0 8pt;}
.pdfx-prose .tw-columns>*{break-inside:avoid;}
.pdfx-prose img{max-width:none;}
.pdfx-prose [data-pdfx-spacer]{display:block;width:100%;margin:0;padding:0;}
`
}

const MARKDOWN_CSS = `
.pdfx-md{
  color:var(--editor-text,#15110b);
  font-family:var(--app-body-font,system-ui,sans-serif);
  font-size:var(--markdown-preview-font-size,22px);
  line-height:1.7;
  position:relative;
  word-break:break-word;
  overflow-wrap:break-word;
}
.pdfx-md h1,.pdfx-md h2,.pdfx-md h3,.pdfx-md h4,.pdfx-md h5,.pdfx-md h6{ font-family:var(--app-display-font,Georgia,serif); margin:0.65em 0 0.3em; line-height:1.2; }
.pdfx-md h1{font-size:1.8em;}
.pdfx-md h2{font-size:1.5em;}
.pdfx-md h3{font-size:1.25em;}
.pdfx-md h4{font-size:1.1em;}
.pdfx-md h5{font-size:1em;}
.pdfx-md h6{font-size:0.9em;color:color-mix(in srgb,var(--editor-text,#15110b) 72%,transparent);}
.pdfx-md p,.pdfx-md blockquote,.pdfx-md pre,.pdfx-md ul,.pdfx-md ol,.pdfx-md table{margin:0.5em 0;}
.pdfx-md ul,.pdfx-md ol{padding-left:1.3em;}
.pdfx-md li>input[type="checkbox"]{margin-right:0.5em;transform:translateY(-1px);accent-color:var(--app-accent,#9ab8ff);}
.pdfx-md li:has(>input[type="checkbox"]){list-style:none;margin-left:-1.3em;}
.pdfx-md blockquote{border-left:3px solid color-mix(in srgb,var(--app-accent,#9ab8ff) 58%,transparent);margin-left:0;padding-left:12px;color:color-mix(in srgb,var(--editor-text,#15110b) 82%,transparent);}
.pdfx-md pre{border-radius:8px;padding:12px 14px;background:color-mix(in srgb,var(--menu-bg,#1d1d1d) 70%,#0d1117);border:1px solid color-mix(in srgb,var(--menu-dropdown-border,#2a2a2a) 60%,transparent);font-size:0.92em;line-height:1.55;white-space:pre-wrap;word-break:break-word;}
.pdfx-md pre code{background:transparent;padding:0;border:0;font-size:1em;}
.pdfx-md code{font-family:"IBM Plex Mono","Menlo","Consolas",monospace;font-size:0.86em;background:color-mix(in srgb,var(--menu-bg,#1d1d1d) 70%,#0d1117);padding:0.12em 0.36em;border-radius:4px;border:1px solid color-mix(in srgb,var(--menu-dropdown-border,#2a2a2a) 50%,transparent);}
.pdfx-md a{color:color-mix(in srgb,var(--app-accent,#9ab8ff) 76%,white 10%);}
.pdfx-md hr{border:0;height:2px;margin:1.4em 0;background:color-mix(in srgb,var(--menu-dropdown-border,#2a2a2a) 80%,transparent);border-radius:2px;}
.pdfx-md table{border-collapse:collapse;width:100%;}
.pdfx-md th,.pdfx-md td{border:1px solid color-mix(in srgb,var(--menu-dropdown-border,#2a2a2a) 70%,transparent);padding:6px 10px;text-align:left;}
.pdfx-md th{background:color-mix(in srgb,var(--menu-bg,#1d1d1d) 86%,transparent);font-weight:600;}
.pdfx-md img{max-width:100%;height:auto;border-radius:6px;}
.pdfx-md .katex-display{margin:0.9em 0;overflow:hidden;padding:0.25em 0;}
.pdfx-md .katex{color:inherit;font-size:1.05em;}
.pdfx-md .katex-error{color:#e55353;font-family:"IBM Plex Mono","Menlo","Consolas",monospace;font-size:0.92em;}
`

function pageCss(paper: string): string {
  return `
@page{ size:${PAGE_W_PX}px ${PAGE_H_PX}px; margin:0; }
html,body{ margin:0; padding:0; background:#fff; }
#pdfx-src{ display:none; }
#pdfx-out{ background:#fff; }
.pdfx-page{
  position:relative;
  width:${PAGE_W_PX}px;
  height:${PAGE_H_PX}px;
  overflow:hidden;
  background:${paper};
  box-sizing:border-box;
  break-after:page;
  page-break-after:always;
}
.pdfx-page:last-child{ break-after:auto; page-break-after:auto; }
`
}

function paginationScript(): string {
  const STRIDE = PAGE_H_PX + PAGE_GAP_PX
  return `
(function(){
  var PAGE_W=${PAGE_W_PX}, PAGE_H=${PAGE_H_PX}, STRIDE=${STRIDE};

  function decodeNatural(src){
    return new Promise(function(res){
      var im=new Image();
      im.onload=function(){ res({w:im.naturalWidth,h:im.naturalHeight}); };
      im.onerror=function(){ res(null); };
      im.src=src;
    });
  }

  // Binary-search the first char offset in textNode that sits on lineTop's row.
  function firstCharOnLine(textNode, lineTop){
    var len=textNode.length; if(!len) return -1;
    var lo=0, hi=len-1, probe=document.createRange();
    while(lo<hi){
      var mid=(lo+hi)>>1;
      probe.setStart(textNode,mid); probe.setEnd(textNode,mid+1);
      var r=probe.getBoundingClientRect();
      if(r.top>=lineTop-0.5) hi=mid; else lo=mid+1;
    }
    return lo;
  }

  // Replace each typewriter floating image (class tw-image__img, from getHTML)
  // with the editor's absolute, optionally-cropped form. Plain <img> (e.g.
  // markdown preview images) are left in normal flow. Returns [{el, top, height}].
  async function reconstructImages(host){
    var imgs=Array.prototype.slice.call(host.querySelectorAll('img.tw-image__img'));
    var out=[];
    for(var i=0;i<imgs.length;i++){
      var img=imgs[i];
      var W=parseFloat(img.style.width||'');
      if(!W){ var wa=parseInt(img.getAttribute('width')||'',10); W=isNaN(wa)?0:wa; }
      var x=parseFloat(img.getAttribute('data-x')||'0')||0;
      var y=parseFloat(img.getAttribute('data-y')||'0')||0;
      var crop=null, ca=img.getAttribute('data-crop');
      if(ca){ var p=ca.split(',').map(parseFloat);
        if(p.length===4 && p.every(function(n){return !isNaN(n);}) && !(p[0]===0&&p[1]===0&&p[2]===0&&p[3]===0))
          crop={top:p[0],right:p[1],bottom:p[2],left:p[3]}; }
      var nat=await decodeNatural(img.getAttribute('src'));
      if(!W){ W=nat?Math.min(nat.w,480):320; }
      var aspect=nat?nat.h/nat.w:null;
      var fullH=aspect!=null?W*aspect:W;
      var wrap=document.createElement('div');
      wrap.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;margin:0;line-height:0;z-index:5;';
      var visH;
      if(crop && aspect!=null){
        var frameW=W*(1-crop.left-crop.right), frameH=fullH*(1-crop.top-crop.bottom);
        var frame=document.createElement('div');
        frame.style.cssText='width:'+frameW+'px;height:'+frameH+'px;overflow:hidden;position:relative;border-radius:2px;';
        var inner=img.cloneNode(false);
        inner.removeAttribute('data-x'); inner.removeAttribute('data-y'); inner.removeAttribute('data-crop'); inner.removeAttribute('width');
        inner.style.cssText='width:'+W+'px;height:'+fullH+'px;position:absolute;left:'+(-(crop.left*W))+'px;top:'+(-(crop.top*fullH))+'px;max-width:none;display:block;';
        frame.appendChild(inner); wrap.appendChild(frame); visH=frameH;
      } else {
        var only=img.cloneNode(false);
        only.removeAttribute('data-x'); only.removeAttribute('data-y'); only.removeAttribute('data-crop'); only.removeAttribute('width');
        only.style.cssText='width:'+W+'px;height:auto;display:block;border-radius:2px;';
        wrap.appendChild(only); visH=fullH;
      }
      if(img.parentNode) img.parentNode.replaceChild(wrap,img);
      out.push({el:wrap, top:y, height:visH});
    }
    return out;
  }

  // Port of pageBreak.ts: compute spacer pushes for every line that crosses a
  // page boundary, using cumulative-push arithmetic over natural positions.
  function computeSpacers(host, mTop, mBot){
    var contentBot=PAGE_H-mBot;
    var pmTop=host.getBoundingClientRect().top;
    var pushes=[], cum=0;
    var blocks=Array.prototype.slice.call(host.children);
    for(var b=0;b<blocks.length;b++){
      var block=blocks[b];
      if(block.getAttribute && block.getAttribute('data-pdfx-spacer')!=null) continue;
      var walker=document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      var tns=[], n;
      while((n=walker.nextNode())) tns.push(n);
      var hasText=tns.some(function(t){return t.length;});
      if(!hasText){
        var r=block.getBoundingClientRect(); if(r.height<1) continue;
        var sY=(r.top-pmTop)+mTop+cum;
        var pIdx=Math.floor(sY/STRIDE), pip=sY-pIdx*STRIDE;
        var ofb=pip+r.height>contentBot+0.5, itop=pIdx>0 && pip<mTop-0.5;
        if(!(ofb||itop)) continue;
        var tgt=ofb?(pIdx+1)*STRIDE+mTop:pIdx*STRIDE+mTop;
        var push=Math.round(tgt-sY); if(push<=0) continue;
        // brk = the page index this block starts when it overflows onto a fresh
        // page (0 = a same-page top-margin nudge, not a page boundary).
        pushes.push({type:'block', node:block, push:push, brk:ofb?(pIdx+1):0}); cum+=push; continue;
      }
      for(var t=0;t<tns.length;t++){
        var tn=tns[t]; if(!tn.length) continue;
        var range=document.createRange(); range.selectNodeContents(tn);
        var rects=Array.prototype.slice.call(range.getClientRects());
        for(var ri=0;ri<rects.length;ri++){
          var rect=rects[ri]; if(rect.height<1||rect.width<1) continue;
          var y2=(rect.top-pmTop)+mTop+cum;
          var pi=Math.floor(y2/STRIDE), pp=y2-pi*STRIDE;
          var o2=pp+rect.height>contentBot+0.5, i2=pi>0 && pp<mTop-0.5;
          if(!(o2||i2)) continue;
          var tg=o2?(pi+1)*STRIDE+mTop:pi*STRIDE+mTop;
          var pu=Math.round(tg-y2); if(pu<=0) continue;
          var ci=firstCharOnLine(tn, rect.top); if(ci<0) continue;
          var last=pushes[pushes.length-1];
          if(last && last.type==='text' && last.node===tn && last.charIndex===ci) continue;
          pushes.push({type:'text', node:tn, charIndex:ci, push:pu, brk:o2?(pi+1):0}); cum+=pu;
        }
      }
    }
    return pushes;
  }

  function applySpacers(pushes){
    // Reverse order: mutating a later split never invalidates an earlier ref.
    for(var i=pushes.length-1;i>=0;i--){
      var p=pushes[i];
      var spacer=document.createElement('div');
      spacer.setAttribute('data-pdfx-spacer','');
      // Mark page-boundary spacers so each page can be anchored independently
      // (see trimBeforeBreak). data-pdfx-break holds the 1-based stack page idx.
      if(p.brk) spacer.setAttribute('data-pdfx-break', String(p.brk));
      spacer.style.cssText='display:block;width:100%;height:'+p.push+'px;margin:0;padding:0;';
      if(p.type==='block'){
        if(p.node.parentNode) p.node.parentNode.insertBefore(spacer, p.node);
      } else {
        var tn=p.node;
        var tail=p.charIndex>0 ? tn.splitText(p.charIndex) : tn;
        if(tail.parentNode) tail.parentNode.insertBefore(spacer, tail);
      }
    }
  }

  // Drop everything (and the boundary spacer itself) that precedes page k's
  // first line, so that line becomes the clone's first content. Walks up from
  // the boundary spacer to the host, removing every earlier sibling at each
  // level — this dissolves the partial paragraph the page break split, leaving
  // only its tail. Returns false (caller falls back to the STRIDE offset) when
  // no boundary marker exists for k.
  function trimBeforeBreak(root, k){
    var sp=root.querySelector('[data-pdfx-break="'+k+'"]');
    if(!sp) return false;
    var node=sp, parent=sp.parentNode;
    while(node.previousSibling) parent.removeChild(node.previousSibling);
    parent.removeChild(sp); node=parent;
    while(node && node!==root){
      parent=node.parentNode;
      while(node.previousSibling) parent.removeChild(node.previousSibling);
      node=parent;
    }
    return true;
  }

  async function processDoc(section, out){
    var mL=+section.getAttribute('data-ml'), mR=+section.getAttribute('data-mr');
    var mT=+section.getAttribute('data-mt'), mB=+section.getAttribute('data-mb');
    var contentW=PAGE_W-mL-mR;
    var cls=section.getAttribute('data-kind')==='markdown' ? 'pdfx-md' : 'pdfx-prose';

    var host=document.createElement('div');
    host.className=cls;
    host.style.cssText='position:fixed;left:-100000px;top:0;width:'+contentW+'px;';
    host.innerHTML=section.innerHTML;
    document.body.appendChild(host);

    var images=await reconstructImages(host);
    void host.offsetHeight;
    applySpacers(computeSpacers(host, mT, mB));
    void host.offsetHeight;

    var numPages=Math.max(1, Math.ceil(host.scrollHeight/STRIDE));

    // Pull images out of the text surface so cloning pages doesn't duplicate
    // base64 across every page — each image is re-attached only to the page(s)
    // it actually intersects.
    for(var d=0;d<images.length;d++){ if(images[d].el.parentNode) images[d].el.parentNode.removeChild(images[d].el); }

    for(var k=0;k<numPages;k++){
      var page=document.createElement('div'); page.className='pdfx-page';
      var surf=document.createElement('div'); surf.className=cls;
      // cloneNode (not innerHTML) so block spacers inside <p> survive verbatim.
      var clone=host.cloneNode(true);
      // Anchor each page independently: trim everything before page k's boundary
      // so its first line is the clone's first content, sitting at the top
      // margin. The whole-surface STRIDE offset (below) relied on the cloned flow
      // measuring identically at print time, but on HiDPI/Retina the live layout
      // snaps line boxes to a finer device grid than printToPDF uses, so a
      // sub-pixel per-line gap accumulated down the surface and shoved each later
      // page's content past the top (and bottom) margin. Anchoring resets that
      // accumulation every page. Fallback to the offset for any page that lacks a
      // boundary marker (e.g. trailing blank pages from the scrollHeight ceil).
      var offTop, shift;
      if(k>0 && trimBeforeBreak(clone, k)){ offTop=mT; shift=k*STRIDE; }
      else { offTop=mT-k*STRIDE; shift=0; }
      if(shift>0){
        // The trimmed leading block (e.g. a heading carried onto a new page)
        // would add its own top margin; drop it so the text lands exactly at mT.
        var fk=clone.firstElementChild;
        while(fk && fk.getAttribute && fk.getAttribute('data-pdfx-spacer')!=null) fk=fk.nextElementSibling;
        if(fk && fk.style) fk.style.marginTop='0';
      }
      surf.style.cssText='position:absolute;left:'+mL+'px;top:'+offTop+'px;width:'+contentW+'px;';
      while(clone.firstChild) surf.appendChild(clone.firstChild);
      for(var ii=0;ii<images.length;ii++){
        // Images are absolutely positioned in the surface's coordinates; when the
        // text was shifted up by "shift", move the image to match. pageY is the
        // unchanged on-page position (mT - k*STRIDE + im.top) either way.
        var im=images[ii]; var imTop=im.top-shift; var pageY=offTop+imTop;
        if(pageY+im.height>0 && pageY<PAGE_H){
          var ic=im.el.cloneNode(true); ic.style.top=imTop+'px'; surf.appendChild(ic);
        }
      }
      page.appendChild(surf); out.appendChild(page);
    }
    document.body.removeChild(host);
  }

  async function run(){
    try{
      if(document.fonts && document.fonts.ready){
        await Promise.race([document.fonts.ready, new Promise(function(r){ setTimeout(r,3000); })]);
      }
      var src=document.getElementById('pdfx-src');
      var out=document.getElementById('pdfx-out');
      var sections=Array.prototype.slice.call(src.querySelectorAll('.pdfx-doc'));
      // Each section (chapter) appends its pages to #pdfx-out in order, so the
      // 1-based page a chapter starts on is just the page count already emitted
      // + 1. Recorded for the per-chapter PDF outline added after printing.
      var startPages=[];
      for(var s=0;s<sections.length;s++){
        startPages.push(out.children.length + 1);
        await processDoc(sections[s], out);
      }
      window.__pdfxChapterStartPages=startPages;
    }catch(e){ if(window.console && console.error) console.error('pdfx pagination failed', e); }
    window.__pdfxReady=true;
  }
  run();
})();
`
}

function pxMargins(m: Margins) {
  return { l: inToPx(m.left), r: inToPx(m.right), t: inToPx(m.top), b: inToPx(m.bottom) }
}

function buildHtml(docs: ExportDoc[]): string {
  const paper = "#ffffff"
  const text = ensureDarkInk(resolveThemeColors().text)
  const includeMarkdown = docs.some((d) => d.kind === "markdown")
  const markdownStyles = includeMarkdown ? `${resolveRootVars(text)}${MARKDOWN_CSS}${hljsCss}${katexCss}` : ""
  const head = `<style>${GOOGLE_FONTS_IMPORT}${pageCss(paper)}${contentCss(text)}${markdownStyles}</style>`
  const sections = docs
    .map((d) => {
      const m = pxMargins(d.margins)
      const rawBody = d.html && d.html.trim() ? d.html : "<p></p>"
      const kind = d.kind === "markdown" ? "markdown" : "prose"
      const body = kind === "prose" ? remapInlineColorsForWhitePaper(rawBody) : rawBody
      return `<section class="pdfx-doc" data-kind="${kind}" data-ml="${m.l}" data-mr="${m.r}" data-mt="${m.t}" data-mb="${m.b}">${body}</section>`
    })
    .join("")
  return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body><div id="pdfx-src">${sections}</div><div id="pdfx-out"></div><script>${paginationScript()}</script></body></html>`
}

export function buildCombinedExportHtml(docs: ExportDoc[]): string {
  return buildHtml(docs)
}

export function buildSingleExportHtml(doc: ExportDoc): string {
  return buildHtml([doc])
}
