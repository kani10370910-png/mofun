// 把 logo 功能打包成单文件 HTML：内联 React 版真实 CSS（视觉 1:1）+ 原生 JS 复刻交互 + 图片 base64。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const LOGOS_DIR = path.join(ROOT, "public", "logos");
const CSS_FILE = path.join(ROOT, "src", "app", "globals.css");
const OUT = process.argv[2] || path.join(ROOT, "logo-单文件.html");

const css = fs.readFileSync(CSS_FILE, "utf8");

function toDataUrl(file) {
  const p = path.join(LOGOS_DIR, file);
  if (!fs.existsSync(p)) return "";
  const buf = fs.readFileSync(p);
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "jpeg" || ext === "jpg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const STYLES = [
  ["智能匹配", "🎨", ""],
  ["图文插画", "⛰️", "1.png"],
  ["图文简约", "📖", "20251114_1.png"],
  ["文字logo", "🍶", "20251114_13.png"],
  ["字母logo", "🔠", "57.png"],
  ["经典徽章", "🏅", "55.png"],
  ["新中式", "🪭", "2025112606.png"],
];
const CATS = ["全部", "图文插画", "图文简约", "文字logo", "字母logo", "经典徽章", "新中式"];
const GRADS = ["thumb-grad-1", "thumb-grad-2", "thumb-grad-3", "thumb-grad-4", "thumb-grad-5", "thumb-grad-6"];
const RAW = [
  ["1.png","鳄鱼文创","图文插画"],["10.png","阿姨家热卤","图文插画"],["11.png","山喜","图文插画"],["12.png","茶饮品牌","图文插画"],["13.png","bluebread","图文插画"],["14.png","三山两院","图文插画"],["15.png","山也","图文插画"],["16.png","野珍","图文插画"],["17.png","永松","图文插画"],["18.png","十里面馆","图文插画"],["19.png","遇见小面","图文插画"],["20.png","柳叶茶道","图文插画"],
  ["20251114_1.png","mojo","图文简约"],["20251114_2.png","KONK","图文简约"],["20251114_3.png","OOUUO","图文简约"],["20251114_4.png","TOMPANY","字母logo"],["20251114_5.png","QUANTUM","字母logo"],["20251114_6.png","lathias Danielsson","字母logo"],["20251114_7.png","sav aceniry","字母logo"],["20251114_8.png","CREATE","字母logo"],["20251114_9.png","YPSY 远洋实业","图文简约"],["20251114_11.png","ROMA 罗玛全屋定制","图文简约"],["20251114_12.png","亚北建筑","图文简约"],["20251114_13.png","雲野堂","文字logo"],["20251114_14.png","青梅酒","文字logo"],["20251114_15.png","舟渔记","文字logo"],["20251114_16.png","捞面馆","文字logo"],["20251114_17.png","粥香万家","文字logo"],["20251114_18.png","深夜食堂","文字logo"],["20251114_19.png","食物说","文字logo"],["20251114_21.png","城市咖啡","图文简约"],["20251114_22.png","蔓花居","图文简约"],["20251114_23.png","城市拾遗","文字logo"],["20251114_24.png","虎啸山庄","经典徽章"],["20251114_25.png","堂前燕","经典徽章"],["20251114_26.png","茶马贡茶","经典徽章"],["20251114_27.png","蜀龙记","经典徽章"],["20251114_28.png","补益堂","经典徽章"],["20251114_29.png","TAURUS","经典徽章"],["20251114_31.png","先卤为敬","经典徽章"],["20251114_32.png","甜记铺","经典徽章"],["20251114_33.png","山楂汽酒","经典徽章"],["20251114_34.png","贺大爷烤串","经典徽章"],["20251114_35.png","LB CREATIVE","字母logo"],["20251114_36.png","GRAN TURISMO","字母logo"],["20251114_37.png","Getaria 野奢酒店","字母logo"],["20251114_38.png","西普科技","字母logo"],["20251114_39.png","未创针织","图文简约"],["20251114_41.png","thrive","字母logo"],["20251114_42.png","DIMARCO","字母logo"],["20251114_43.png","城市森林基地","图文简约"],["20251114_44.png","黑爵舞蹈","图文简约"],["20251114_45.png","马克重工","图文简约"],
  ["2025112601.png","珑华珠宝","新中式"],["2025112602.png","燕味春","新中式"],["2025112603.png","无忧雨民宿","新中式"],["2025112604.png","鹿韵坊","新中式"],["2025112605.png","三山候","新中式"],["2025112606.png","鹿福康","新中式"],["2025112607.png","鹤羽堂","新中式"],["2025112608.png","雀羽","新中式"],["2025112609.png","孤山茶舍","新中式"],
  ["21.jpeg","老妈水饺","图文插画"],["22.png","老巷面馆","图文插画"],["23.png","蜀韵红锅","图文插画"],["24.png","渔人码头","图文插画"],["25.png","鹿果森林","图文插画"],["26.png","ELE ARCHITECTS","图文简约"],["27.jpeg","梵音","图文插画"],["28.jpeg","藏书林","图文插画"],["29.jpeg","花满弄","图文插画"],["30.jpeg","四石文化","图文简约"],["31.png","有山茶商","图文简约"],["32.jpeg","云府","图文简约"],["33.jpeg","景城美居","图文简约"],["34.jpeg","道山茶庄","图文简约"],["35.jpeg","青居阁","图文简约"],["36.png","柯氏糊汤","文字logo"],["37.png","豆蔻年华","文字logo"],["38.png","善薰","文字logo"],["39.png","雲焱堂","文字logo"],["40.png","鸟酒居","文字logo"],["41.png","酿山秋","文字logo"],["42.png","古木茶社","文字logo"],["43.png","东方韵味","文字logo"],["44.png","卤味盛宴","文字logo"],["45.png","青雲逸品","文字logo"],["46.png","唐朝烤鱼","经典徽章"],["47.png","花鸟间","经典徽章"],["48.png","粤港记","经典徽章"],["49.png","觅花","经典徽章"],["50.png","鹿小堂","经典徽章"],["51.png","爆汁汉堡","经典徽章"],["52.png","暹罗食集","经典徽章"],["53.png","老少兴点心行","经典徽章"],["54.png","品鉴大师","经典徽章"],["55.png","老茶王","经典徽章"],["56.png","NOVEX 诺威","字母logo"],["57.png","hero","字母logo"],["58.png","luxe","字母logo"],["59.png","ZYNC","字母logo"],["6.png","章鱼丸子","图文插画"],["60.png","YT TECH","字母logo"],["61.png","生鲜汇","字母logo"],["62.png","A&W BUILDING","字母logo"],["63.png","FRANK","字母logo"],["64.png","极光工作室","字母logo"],["65.png","ANBOLI","字母logo"],["66.png","恒宇地产","字母logo"],["67.png","BOSILI","字母logo"],["68.png","TOA RALLIC","字母logo"],["7.png","食趣坊","图文插画"],["8.png","小方精酿","图文插画"],["9.png","暖焙坊","图文插画"],
];
const DESC = {
  "图文插画": (n) => `为「${n}」设计图文插画风 LOGO：以贴合品牌调性的卡通/手绘元素为主体，画面生动有故事感，搭配品牌名「${n}」中文字体，色彩明快、亲和力强。`,
  "图文简约": (n) => `为「${n}」设计图文简约风 LOGO：几何化的简洁图形 + 品牌名「${n}」，线条干净、留白充足，现代极简、辨识度高。`,
  "文字logo": (n) => `为「${n}」设计文字型 LOGO：以「${n}」字体设计为核心，笔画做艺术化处理，可点缀印章/落款元素，大气耐看。`,
  "字母logo": (n) => `为「${n}」设计字母 LOGO：提取品牌名首字母做图形化组合，结构稳定、富有设计感，配色简洁现代。`,
  "经典徽章": (n) => `为「${n}」设计经典徽章 LOGO：盾形/圆形徽章版式，内含品牌名「${n}」与象征元素，质感复古、专业可信。`,
  "新中式": (n) => `为「${n}」设计新中式 LOGO：以国风线条、剪纸/水墨等元素构图，融入品牌名「${n}」书法字，雅致东方。`,
  "智能匹配": (n) => `为「${n}」设计 LOGO：智能匹配最合适的风格，突出品牌名「${n}」，简洁现代、辨识度高。`,
};

const styles = STYLES.map(([name, emoji, file]) => ({ name, emoji, img: file ? toDataUrl(file) : "" }));
const cases = RAW.map(([file, name, cat], i) => ({ name, cat, grad: GRADS[i % 6], img: toDataUrl(file), desc: (DESC[cat] || DESC["智能匹配"])(name) }));

const DATA = JSON.stringify({ styles, cats: CATS, cases });

const HEART = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 11.5a2.5 2.5 0 0 1 3.5 0l1 1 1-1a2.5 2.5 0 1 1 3.5 3.5L12 19l-4.5-4a2.5 2.5 0 0 1 0-3.5Z"/></svg>';
const SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V14"/><path d="M9 14c.4-4 3-6.6 8-7"/><path d="M13.5 5.5 19.5 5l-.6 6"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3.5c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5Z"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>魔方智绘 · LOGO 设计</title>
<style>
${css}
/* 单文件兜底 */
body{margin:0;}
.topbar2{display:flex;align-items:center;gap:12px;padding:14px 28px;background:#fff;border-bottom:1px solid var(--c-line);}
.tb-logo{width:40px;height:40px;border-radius:10px;background:var(--c-primary);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;}
.tb-brand{font-weight:800;font-size:18px;}.tb-brand small{display:block;font-size:11px;color:var(--c-muted);font-weight:400;}
.tb-nav{display:flex;gap:6px;margin-left:24px;}.tb-nav a{padding:8px 14px;border-radius:10px;font-size:15px;color:var(--c-ink);text-decoration:none;}
.tb-nav a.on{background:var(--c-primary-soft);color:var(--c-primary-dark);font-weight:600;}
</style></head>
<body>
<div class="topbar2"><div class="tb-logo">魔</div><div class="tb-brand">MOFUN 魔方<small>智绘平台</small></div>
<nav class="tb-nav"><a class="on">品牌设计 · LOGO</a></nav></div>
<div class="page"><div class="editor-layout">
  <aside class="editor-rail"><div class="rail-item on"><span class="ri-ico">${SPARK}</span><span>logo</span></div></aside>
  <div class="workspace">
    <div class="ws-panel sticky">
      <div class="ws-scroll">
        <div class="field"><div class="ws-label">logo 风格</div><div class="logo-style-grid" id="styleGrid"></div></div>
        <div class="field"><div class="ws-label">品牌名称 <span class="req">*</span></div><input type="text" id="brand" placeholder="必填项，例如：安吉白茶"/></div>
        <div class="field"><div class="ws-label">创意描述 <span class="opt">（选填）</span></div>
          <div class="ta-wrap"><textarea id="desc" placeholder="示例：为「安吉白茶」设计图文插画风 LOGO，以高山云雾茶园与嫩芽为主体，国风清新、色彩明快，搭配品牌名中文字体（选填）"></textarea>
          <button class="ta-clear" id="clearDesc" style="display:none">清空</button></div></div>
      </div>
      <div class="ws-foot"><button class="btn btn-primary btn-block gen-btn" id="genBtn">${SPARK} 立即生成</button></div>
    </div>
    <div id="result"></div>
  </div>
</div></div>
<div id="modalRoot"></div>
<div class="toast-host-bottom"><div class="toast" id="toast" style="display:none"></div></div>
<script>
const DATA=${DATA};
const PAL=[{m:"#188772",s:"#7fc8b8",b:"#eef6f3"},{m:"#d97d1a",s:"#f3b96a",b:"#fdf3e7"},{m:"#3358c4",s:"#8aa3e8",b:"#eef1fb"},{m:"#b03a5b",s:"#e08aa0",b:"#fbeef2"}];
const GRADS=["thumb-grad-1","thumb-grad-2","thumb-grad-3","thumb-grad-4"];
const HEART=\`${HEART}\`,SHARE=\`${SHARE}\`,COPY=\`${COPY}\`,TRASH=\`${TRASH}\`,SPARK=\`${SPARK}\`;
let S={style:"智能匹配",tab:"history",cat:"全部",busy:false,onlyFav:false,
  runs:[], favs:new Set(JSON.parse(localStorage.getItem("logo.favs")||"[]")),
  hist:[{prompt:"王一鸣，零食公司，需要和零食元素结合",style:"经典徽章",desc:"为零食公司「王一鸣」设计经典徽章 LOGO，盾形徽章融合饼干、坚果等零食元素，复古质感、专业可信，突出品牌名。",time:"",imgs:[null,null,null,null]},
          {prompt:"刘一锅，新中式，要有锅的形状，要有刘这个字结合",style:"智能匹配",desc:"为「刘一锅」设计新中式 LOGO，以锅的形状为主体图形，巧妙融入「刘」字，国风线条、雅致有食欲感。",time:"",imgs:[null,null,null,null]}]};
function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function mk(b){var t=(b||"").trim();if(!t)return"M";var c=t[0];return /[a-zA-Z]/.test(c)?c.toUpperCase():c;}
function svg(brand,style,v){var p=PAL[v%4],name=esc((brand||"品牌名").trim()),m=esc(mk(brand)),g="",nf='font-family="PingFang SC,Microsoft YaHei,sans-serif"',ns='font-weight="800" fill="'+p.m+'"',sz=56;
  if(style==="图文插画")g='<g transform="translate(256 196)"><circle r="92" fill="'+p.b+'"/><circle r="92" fill="none" stroke="'+p.m+'" stroke-width="4"/><text x="0" y="6" font-size="84" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text><path d="M-60 60 Q0 30 60 60" fill="none" stroke="'+p.s+'" stroke-width="6" stroke-linecap="round"/></g>';
  else if(style==="图文简约")g='<g transform="translate(256 196)"><rect x="-70" y="-70" width="140" height="140" rx="30" fill="none" stroke="'+p.m+'" stroke-width="6"/><text x="0" y="6" font-size="78" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';
  else if(style==="文字logo"){g='<g transform="translate(256 180)"><rect x="-16" y="-40" width="32" height="32" rx="4" fill="'+p.m+'"/><text x="0" y="-18" font-size="22" fill="#fff" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';nf='font-family="STKaiti,KaiTi,serif"';sz=64;}
  else if(style==="字母logo")g='<g transform="translate(256 196)"><circle r="84" fill="'+p.m+'"/><text x="0" y="6" font-size="92" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-family="Arial">'+m+'</text></g>';
  else if(style==="经典徽章")g='<g transform="translate(256 196)"><path d="M-78 -78 H78 V40 Q78 92 0 110 Q-78 92 -78 40 Z" fill="'+p.m+'"/><path d="M-66 -66 H66 V36 Q66 80 0 96 Q-66 80 -66 36 Z" fill="none" stroke="#fff" stroke-width="3"/><text x="0" y="0" font-size="58" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';
  else if(style==="新中式"){g='<g transform="translate(256 196)"><circle r="86" fill="none" stroke="'+p.m+'" stroke-width="5"/><circle r="70" fill="'+p.b+'"/><text x="0" y="4" font-size="72" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle" font-family="STKaiti,KaiTi,serif">'+m+'</text></g>';nf='font-family="STKaiti,KaiTi,serif"';}
  else g='<g transform="translate(256 196)"><circle r="86" fill="'+p.b+'"/><text x="0" y="6" font-size="84" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';
  var fit=name.length>6?Math.max(30,Math.floor(sz*(6/name.length))):sz;
  var label='<text x="256" y="360" font-size="'+fit+'" '+ns+' text-anchor="middle" '+nf+' letter-spacing="2">'+name+'</text>';
  return "data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fff"/>'+g+label+'</svg>');}
function nowStamp(){var d=new Date(),z=n=>n<10?"0"+n:n;return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+" "+z(d.getHours())+":"+z(d.getMinutes());}
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.display="";t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");t.style.display="none";},2000);}
function favKey(n){return "图片|"+n+" · LOGO";}
function saveFavs(){localStorage.setItem("logo.favs",JSON.stringify([...S.favs]));}
function syncClear(){document.getElementById("clearDesc").style.display=document.getElementById("desc").value.trim()?"":"none";}

function renderStyles(){
  document.getElementById("styleGrid").innerHTML=DATA.styles.map(function(s){
    return '<div class="logo-style'+(S.style===s.name?' on':'')+'" data-s="'+s.name+'"><div class="ls-thumb">'+(s.img?'<img class="ls-thumb-img" src="'+s.img+'"/>':s.emoji)+'</div><div class="ls-name">'+s.name+'</div></div>';}).join("");
  document.querySelectorAll(".logo-style").forEach(function(el){el.onclick=function(){S.style=el.dataset.s;renderStyles();};});
}
// 初始化两条种子历史的结果图（用 emoji 占位转 svg 不合适，用风格 svg 占位品牌名）
S.hist.forEach(function(h){h.imgs=[0,1,2,3].map(function(i){return svg(h.prompt.split("，")[0],h.style,i);});});

function resultCard(img,brand,gi){
  var fav=S.favs.has(favKey(brand));
  return '<div class="lh-img '+GRADS[gi]+'"><img class="lh-result-img" src="'+img+'"/>'+
    '<button class="lh-fav'+(fav?' on':'')+'" data-fav="'+esc(brand)+'">'+HEART+'</button>'+
    '<div class="lh-hover lh-hover-bottom"><button class="btn btn-ghost btn-sm" data-dl="'+esc(brand)+'" data-img="'+gi+'">下载可编辑文件</button></div>'+
    '<button class="lh-saveas" data-save="'+esc(brand)+'" title="另存为我的素材">'+SHARE+'</button>'+
    '<span class="lh-mark">由 AI 生成</span></div>';
}
function metaRow(brand,desc,style,time){
  return '<div class="lh-meta"><span class="lh-title"><b class="lh-prompt">'+esc(brand)+'</b>'+(desc?'<span class="lh-desc">'+esc(desc)+'</span>':'')+'</span>'+
    '<span class="lg-cat">'+style+'</span>'+
    '<button class="lh-ico lh-tip" data-tip="复制" data-copy="'+esc(brand)+'">'+COPY+'</button>'+
    '<button class="lh-ico lh-tip" data-tip="删除" data-del="'+esc(brand)+'">'+TRASH+'</button>'+
    (time?'<span class="lh-time-spacer"></span><span class="lh-time">'+time+'</span>':'')+'</div>';
}
function renderHistory(){
  var v=document.getElementById("result");
  var head=tabsHtml();
  var rows="";
  if(S.runs.length){rows+='<div class="lh-group"><div class="lh-group-title">今天</div>';
    S.runs.forEach(function(r){
      var loading=r.pct<100;
      var cells=r.imgs.map(function(img,i){return loading?
        '<div class="lh-img '+GRADS[i]+' lh-loading"><span class="lh-progress">'+r.pct+'%完成</span><span class="lh-think"><span class="font-spinner"></span><em>正在构思…</em></span></div>'
        :resultCard(img,r.brand,i);}).join("");
      if(!loading&&S.onlyFav&&!S.favs.has(favKey(r.brand)))return;
      rows+='<div class="lh-row">'+metaRow(r.brand,r.desc,r.style,r.time)+'<div class="lh-imgs">'+cells+'</div></div>';});
    rows+='</div>';}
  rows+='<div class="lh-group"><div class="lh-group-title">今天</div>';
  S.hist.forEach(function(h){if(S.onlyFav&&!S.favs.has(favKey(h.prompt)))return;
    var cells=h.imgs.map(function(img,i){return resultCard(img,h.prompt,i);}).join("");
    rows+='<div class="lh-row">'+metaRow(h.prompt,h.desc,h.style,h.time)+'<div class="lh-imgs">'+cells+'</div></div>';});
  rows+='</div>';
  v.innerHTML=head+'<div id="logoHistory">'+rows+'</div>';
  bindHead();bindCards();
}
function tabsHtml(){
  return '<div class="lg-head"><div class="tabs">'+
    '<div class="tab'+(S.tab==="history"?" on":"")+'" data-tab="history">生成历史</div>'+
    '<div class="tab'+(S.tab==="inspire"?" on":"")+'" data-tab="inspire">参考灵感</div></div>'+
    '<label class="lg-fav-switch"><input type="checkbox" id="onlyFav"'+(S.onlyFav?" checked":"")+'/><span class="lg-switch"></span>只看收藏</label></div>';
}
function bindHead(){
  document.querySelectorAll(".tab").forEach(function(el){el.onclick=function(){S.tab=el.dataset.tab;render();};});
  var of=document.getElementById("onlyFav");if(of)of.onchange=function(){S.onlyFav=of.checked;render();};
}
function bindCards(){
  var v=document.getElementById("result");
  v.querySelectorAll("[data-fav]").forEach(function(b){b.onclick=function(e){e.stopPropagation();var k=favKey(b.dataset.fav);S.favs.has(k)?S.favs.delete(k):S.favs.add(k);saveFavs();render();toast(S.favs.has(k)?"已收藏":"已取消收藏");};});
  v.querySelectorAll("[data-dl]").forEach(function(b){b.onclick=function(){openDownload(b.dataset.dl,b.getAttribute("data-img"));};});
  v.querySelectorAll("[data-save]").forEach(function(b){b.onclick=function(e){e.stopPropagation();confirmModal("是否另存为我的素材？","取消","储存",function(){toast("已另存为「仓库 · 我的素材」");});};});
  v.querySelectorAll("[data-copy]").forEach(function(b){b.onclick=function(){var h=findRow(b.dataset.copy);if(h){document.getElementById("brand").value=h.prompt.split("，")[0];document.getElementById("desc").value=h.desc||"";syncClear();var st=DATA.styles.find(function(x){return x.name===h.style;});S.style=st?h.style:"智能匹配";renderStyles();toast("已复制该记录到左侧");}};});
  v.querySelectorAll("[data-del]").forEach(function(b){b.onclick=function(){confirmModal("确定删除这个记录吗？","取消","删除",function(){S.runs=S.runs.filter(function(r){return r.brand!==b.dataset.del;});S.hist=S.hist.filter(function(h){return h.prompt!==b.dataset.del;});render();toast("已删除该记录");});};});
}
function findRow(name){return S.runs.find(function(r){return r.brand===name;})||S.hist.find(function(h){return h.prompt===name;});}

function renderInspire(){
  var v=document.getElementById("result");
  var chips='<div class="filter-row" style="margin-bottom:16px">'+DATA.cats.map(function(c){return '<span class="sel-chip'+(S.cat===c?" on":"")+'" data-cat="'+c+'">'+c+'</span>';}).join("")+'</div>';
  var list=DATA.cases.filter(function(c){return S.cat==="全部"||c.cat===S.cat;});
  var grid='<div class="grid grid-4">'+list.map(function(c){
    return '<div class="lg-case" data-name="'+esc(c.name)+'" data-cat="'+c.cat+'" data-desc="'+esc(c.desc)+'"><div class="lg-case-thumb"><img class="lg-case-img" src="'+c.img+'"/><div class="case-hover"><button class="btn btn-sm lg-case-btn">制作同款</button></div></div><div class="lg-case-foot"><span class="lg-case-name">'+esc(c.name)+'</span><span class="lg-cat">'+c.cat+'</span></div></div>';}).join("")+'</div>';
  v.innerHTML=tabsHtml()+'<div>'+chips+grid+'</div>';
  bindHead();
  v.querySelectorAll(".sel-chip").forEach(function(el){el.onclick=function(){S.cat=el.dataset.cat;renderInspire();};});
  v.querySelectorAll(".lg-case").forEach(function(el){el.onclick=function(){
    var name=el.dataset.name,cat=el.dataset.cat,desc=el.dataset.desc;
    S.style=DATA.styles.some(function(s){return s.name===cat;})?cat:"智能匹配";
    document.getElementById("brand").value=name;document.getElementById("desc").value=desc;syncClear();renderStyles();
    S.tab="history";render();toast("已套用「"+name+"」：风格、品牌名、创意描述已填入");};});
}
function render(){S.tab==="inspire"?renderInspire():renderHistory();}

function generate(){
  if(S.busy)return;
  var brand=document.getElementById("brand").value.trim();
  if(!brand){toast("请输入品牌名称！");return;}
  S.busy=true;document.getElementById("genBtn").disabled=true;S.tab="history";
  var desc=document.getElementById("desc").value.trim();
  var row={brand:brand,style:S.style,desc:desc,time:nowStamp(),pct:0,imgs:[0,1,2,3].map(function(i){return svg(brand,S.style,i);})};
  S.runs.unshift(row);render();
  var pct=0,t=setInterval(function(){pct+=12+(pct%7);if(pct>=100)pct=100;row.pct=pct;render();
    if(pct>=100){clearInterval(t);S.busy=false;document.getElementById("genBtn").disabled=false;toast("logo 生成完成（演示）");}},300);
}
// 下载可编辑文件弹窗（三态）
function openDownload(brand,gi){
  var img=svg(brand,S.style,+gi||0);
  var pack="idle";
  function panel(){
    var btn=pack==="idle"?'<button class="btn btn-primary" id="dlGo">'+SPARK+' 生成可编辑文件 <span class="btn-credit">12 算力</span></button>'
      :pack==="packing"?'<button class="btn btn-primary" disabled><span class="dl-spinner"></span> 正在打包文件</button>'
      :pack==="done"?'<button class="btn btn-primary" id="dlSave">⬇ 下载到本地</button>'
      :'<button class="btn btn-primary dl-retry" id="dlGo">↻ 重新下载文件</button>';
    return '<div class="modal-mask" id="dlMask"><div class="dl-panel"><div class="dl-head"><div class="dl-title">LOGO 下载</div><button class="bf-close" id="dlClose">✕</button></div>'+
      '<div class="dl-body"><div class="dl-preview"><img class="dl-preview-img" src="'+img+'"/></div>'+
      '<div class="dl-info"><h3 class="dl-info-title">点击下方按钮生成可编辑文件</h3><div class="dl-divider"></div><div class="dl-formats-label">文件明细：</div>'+
      '<div class="dl-formats"><div class="dl-format"><span class="dl-fmt-ico dl-fmt-png">PNG</span><div class="dl-fmt-text"><div class="dl-fmt-name">高清 PNG 格式</div><div class="dl-fmt-desc">可用于微信 / 网店等图片</div></div></div>'+
      '<div class="dl-format"><span class="dl-fmt-ico dl-fmt-alpha">PNG</span><div class="dl-fmt-text"><div class="dl-fmt-name">透明背景 PNG 格式</div><div class="dl-fmt-desc">背景透明的图片格式</div></div></div>'+
      '<div class="dl-format"><span class="dl-fmt-ico dl-fmt-svg">SVG</span><div class="dl-fmt-text"><div class="dl-fmt-name">矢量可编辑 SVG 格式</div><div class="dl-fmt-desc">可印刷并任意调整，即源文件</div></div></div></div>'+
      '<div class="dl-actions">'+btn+'</div></div></div></div>';
  }
  function mount(){document.getElementById("modalRoot").innerHTML=panel();
    var m=document.getElementById("dlMask");m.onclick=function(e){if(e.target===m)close();};
    document.getElementById("dlClose").onclick=close;
    var go=document.getElementById("dlGo");if(go)go.onclick=function(){pack="packing";mount();setTimeout(function(){pack=Math.random()>0.25?"done":"error";mount();},1500);};
    var sv=document.getElementById("dlSave");if(sv)sv.onclick=function(){var a=document.createElement("a");a.href=img;a.download=brand+"-logo.svg";a.click();toast("已下载到本地");close();};
  }
  function close(){document.getElementById("modalRoot").innerHTML="";}
  mount();
}
function confirmModal(title,cancel,ok,onOk){
  document.getElementById("modalRoot").innerHTML='<div class="modal-mask" id="cMask"><div class="confirm-panel"><div class="confirm-title">'+title+'</div><div class="confirm-actions"><button class="confirm-btn confirm-cancel" id="cNo">'+cancel+'</button><button class="confirm-btn confirm-ok" id="cYes">'+ok+'</button></div></div></div>';
  var close=function(){document.getElementById("modalRoot").innerHTML="";};
  document.getElementById("cMask").onclick=function(e){if(e.target.id==="cMask")close();};
  document.getElementById("cNo").onclick=close;
  document.getElementById("cYes").onclick=function(){close();onOk();};
}

document.getElementById("genBtn").onclick=generate;
document.getElementById("desc").oninput=syncClear;
document.getElementById("clearDesc").onclick=function(){document.getElementById("desc").value="";syncClear();};
renderStyles();render();
</script>
</body></html>`;

fs.writeFileSync(OUT, html, "utf8");
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log("已生成:", OUT, "(" + mb + " MB)");
