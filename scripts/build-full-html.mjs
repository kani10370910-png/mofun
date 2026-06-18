// 把「整站 demo 单文件」里的 logo 数据/逻辑升级为重构后的新版（真实图库 base64 + 动态 SVG 生成），
// 输出一个双击可开的整站单文件。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const LOGOS_DIR = path.join(ROOT, "public", "logos");
const BASE = process.argv[2]; // 基底 HTML（桌面整站单文件）
const OUT = process.argv[3] || BASE;

function toDataUrl(file) {
  const p = path.join(LOGOS_DIR, file);
  if (!fs.existsSync(p)) return "";
  const buf = fs.readFileSync(p);
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "jpeg" || ext === "jpg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const STYLES = [
  ["智能匹配", "🎨", "thumb-grad-4", ""],
  ["图文插画", "⛰️", "thumb-grad-1", "1.png"],
  ["图文简约", "📖", "thumb-grad-5", "20251114_1.png"],
  ["文字logo", "🍶", "thumb-grad-6", "20251114_13.png"],
  ["字母logo", "🔠", "thumb-grad-3", "57.png"],
  ["经典徽章", "🏅", "thumb-grad-2", "55.png"],
  ["新中式", "🪭", "thumb-grad-1", "2025112606.png"],
];
const CATS = ["全部", "图文插画", "图文简约", "文字logo", "字母logo", "经典徽章", "新中式"];
const RAW = [
  ["1.png","鳄鱼文创","图文插画"],["10.png","阿姨家热卤","图文插画"],["11.png","山喜","图文插画"],["12.png","茶饮品牌","图文插画"],["13.png","bluebread","图文插画"],["14.png","三山两院","图文插画"],["15.png","山也","图文插画"],["16.png","野珍","图文插画"],["17.png","永松","图文插画"],["18.png","十里面馆","图文插画"],["19.png","遇见小面","图文插画"],["20.png","柳叶茶道","图文插画"],
  ["20251114_1.png","mojo","图文简约"],["20251114_2.png","KONK","图文简约"],["20251114_3.png","OOUUO","图文简约"],["20251114_4.png","TOMPANY","字母logo"],["20251114_5.png","QUANTUM","字母logo"],["20251114_6.png","lathias Danielsson","字母logo"],["20251114_7.png","sav aceniry","字母logo"],["20251114_8.png","CREATE","字母logo"],["20251114_9.png","YPSY 远洋实业","图文简约"],["20251114_11.png","ROMA 罗玛全屋定制","图文简约"],["20251114_12.png","亚北建筑","图文简约"],["20251114_13.png","雲野堂","文字logo"],["20251114_14.png","青梅酒","文字logo"],["20251114_15.png","舟渔记","文字logo"],["20251114_16.png","捞面馆","文字logo"],["20251114_17.png","粥香万家","文字logo"],["20251114_18.png","深夜食堂","文字logo"],["20251114_19.png","食物说","文字logo"],["20251114_21.png","城市咖啡","图文简约"],["20251114_22.png","蔓花居","图文简约"],["20251114_23.png","城市拾遗","文字logo"],["20251114_24.png","虎啸山庄","经典徽章"],["20251114_25.png","堂前燕","经典徽章"],["20251114_26.png","茶马贡茶","经典徽章"],["20251114_27.png","蜀龙记","经典徽章"],["20251114_28.png","补益堂","经典徽章"],["20251114_29.png","TAURUS","经典徽章"],["20251114_31.png","先卤为敬","经典徽章"],["20251114_32.png","甜记铺","经典徽章"],["20251114_33.png","山楂汽酒","经典徽章"],["20251114_34.png","贺大爷烤串","经典徽章"],["20251114_35.png","LB CREATIVE","字母logo"],["20251114_36.png","GRAN TURISMO","字母logo"],["20251114_37.png","Getaria 野奢酒店","字母logo"],["20251114_38.png","西普科技","字母logo"],["20251114_39.png","未创针织","图文简约"],["20251114_41.png","thrive","字母logo"],["20251114_42.png","DIMARCO","字母logo"],["20251114_43.png","城市森林基地","图文简约"],["20251114_44.png","黑爵舞蹈","图文简约"],["20251114_45.png","马克重工","图文简约"],
  ["2025112601.png","珑华珠宝","新中式"],["2025112602.png","燕味春","新中式"],["2025112603.png","无忧雨民宿","新中式"],["2025112604.png","鹿韵坊","新中式"],["2025112605.png","三山候","新中式"],["2025112606.png","鹿福康","新中式"],["2025112607.png","鹤羽堂","新中式"],["2025112608.png","雀羽","新中式"],["2025112609.png","孤山茶舍","新中式"],
  ["21.jpeg","老妈水饺","图文插画"],["22.png","老巷面馆","图文插画"],["23.png","蜀韵红锅","图文插画"],["24.png","渔人码头","图文插画"],["25.png","鹿果森林","图文插画"],["26.png","ELE ARCHITECTS","图文简约"],["27.jpeg","梵音","图文插画"],["28.jpeg","藏书林","图文插画"],["29.jpeg","花满弄","图文插画"],["30.jpeg","四石文化","图文简约"],["31.png","有山茶商","图文简约"],["32.jpeg","云府","图文简约"],["33.jpeg","景城美居","图文简约"],["34.jpeg","道山茶庄","图文简约"],["35.jpeg","青居阁","图文简约"],["36.png","柯氏糊汤","文字logo"],["37.png","豆蔻年华","文字logo"],["38.png","善薰","文字logo"],["39.png","雲焱堂","文字logo"],["40.png","鸟酒居","文字logo"],["41.png","酿山秋","文字logo"],["42.png","古木茶社","文字logo"],["43.png","东方韵味","文字logo"],["44.png","卤味盛宴","文字logo"],["45.png","青雲逸品","文字logo"],["46.png","唐朝烤鱼","经典徽章"],["47.png","花鸟间","经典徽章"],["48.png","粤港记","经典徽章"],["49.png","觅花","经典徽章"],["50.png","鹿小堂","经典徽章"],["51.png","爆汁汉堡","经典徽章"],["52.png","暹罗食集","经典徽章"],["53.png","老少兴点心行","经典徽章"],["54.png","品鉴大师","经典徽章"],["55.png","老茶王","经典徽章"],["56.png","NOVEX 诺威","字母logo"],["57.png","hero","字母logo"],["58.png","luxe","字母logo"],["59.png","ZYNC","字母logo"],["6.png","章鱼丸子","图文插画"],["60.png","YT TECH","字母logo"],["61.png","生鲜汇","字母logo"],["62.png","A&W BUILDING","字母logo"],["63.png","FRANK","字母logo"],["64.png","极光工作室","字母logo"],["65.png","ANBOLI","字母logo"],["66.png","恒宇地产","字母logo"],["67.png","BOSILI","字母logo"],["68.png","TOA RALLIC","字母logo"],["7.png","食趣坊","图文插画"],["8.png","小方精酿","图文插画"],["9.png","暖焙坊","图文插画"],
];

const styles = STYLES.map(([name, emoji, grad, file]) => ({ name, emoji, grad, img: file ? toDataUrl(file) : "" }));
const cases = RAW.map(([file, name, cat]) => ({ emoji: "🎨", name, cat, grad: "thumb-grad-1", img: toDataUrl(file) }));

let html = fs.readFileSync(BASE, "utf8");

// 1) 替换 DATA.logoStyles （从 "DATA.logoStyles = [" 到首个 "];"）
function replaceBlock(src, startMarker, newContent) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error("找不到标记: " + startMarker);
  const end = src.indexOf("];", i);
  if (end < 0) throw new Error("找不到结束 ]; for " + startMarker);
  return src.slice(0, i) + newContent + src.slice(end + 2);
}

html = replaceBlock(html, "DATA.logoStyles = [", "DATA.logoStyles = " + JSON.stringify(styles));
html = replaceBlock(html, "DATA.logoCats = [", "DATA.logoCats = " + JSON.stringify(CATS));
html = replaceBlock(html, "DATA.logoCases = [", "DATA.logoCases = " + JSON.stringify(cases));

// 2) 注入升级补丁脚本（在 </body> 前）：风格卡/参考灵感卡显示真实图、生成动态 SVG
const patch = `
<script>
/* ===== LOGO 单文件增强补丁（真实图库 + 动态 SVG 生成）===== */
(function(){
  var PAL=[{m:"#188772",s:"#7fc8b8",b:"#eef6f3"},{m:"#d97d1a",s:"#f3b96a",b:"#fdf3e7"},{m:"#3358c4",s:"#8aa3e8",b:"#eef1fb"},{m:"#b03a5b",s:"#e08aa0",b:"#fbeef2"}];
  function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function mk(b){var t=(b||"").trim();if(!t)return"M";var c=t[0];return /[a-zA-Z]/.test(c)?c.toUpperCase():c;}
  window.__logoSvg=function(brand,style,v){
    var p=PAL[v%4],name=esc((brand||"品牌名").trim()),m=esc(mk(brand)),g="",nf='font-family="PingFang SC,Microsoft YaHei,sans-serif"',ns='font-weight="800" fill="'+p.m+'"',sz=56;
    if(style==="图文插画"){g='<g transform="translate(256 196)"><circle r="92" fill="'+p.b+'"/><circle r="92" fill="none" stroke="'+p.m+'" stroke-width="4"/><text x="0" y="6" font-size="84" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text><path d="M-60 60 Q0 30 60 60" fill="none" stroke="'+p.s+'" stroke-width="6" stroke-linecap="round"/></g>';}
    else if(style==="图文简约"){g='<g transform="translate(256 196)"><rect x="-70" y="-70" width="140" height="140" rx="30" fill="none" stroke="'+p.m+'" stroke-width="6"/><text x="0" y="6" font-size="78" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';}
    else if(style==="文字logo"){g='<g transform="translate(256 180)"><rect x="-16" y="-40" width="32" height="32" rx="4" fill="'+p.m+'"/><text x="0" y="-18" font-size="22" fill="#fff" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';nf='font-family="STKaiti,KaiTi,serif"';sz=64;}
    else if(style==="字母logo"){g='<g transform="translate(256 196)"><circle r="84" fill="'+p.m+'"/><text x="0" y="6" font-size="92" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle" font-family="Arial">'+m+'</text></g>';}
    else if(style==="经典徽章"){g='<g transform="translate(256 196)"><path d="M-78 -78 H78 V40 Q78 92 0 110 Q-78 92 -78 40 Z" fill="'+p.m+'"/><path d="M-66 -66 H66 V36 Q66 80 0 96 Q-66 80 -66 36 Z" fill="none" stroke="#fff" stroke-width="3"/><text x="0" y="0" font-size="58" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';}
    else if(style==="新中式"){g='<g transform="translate(256 196)"><circle r="86" fill="none" stroke="'+p.m+'" stroke-width="5"/><circle r="70" fill="'+p.b+'"/><text x="0" y="4" font-size="72" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle" font-family="STKaiti,KaiTi,serif">'+m+'</text></g>';nf='font-family="STKaiti,KaiTi,serif"';}
    else{g='<g transform="translate(256 196)"><circle r="86" fill="'+p.b+'"/><text x="0" y="6" font-size="84" font-weight="800" fill="'+p.m+'" text-anchor="middle" dominant-baseline="middle">'+m+'</text></g>';}
    var fit=name.length>6?Math.max(30,Math.floor(sz*(6/name.length))):sz;
    var label='<text x="256" y="360" font-size="'+fit+'" '+ns+' text-anchor="middle" '+nf+' letter-spacing="2">'+name+'</text>';
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fff"/>'+g+label+'</svg>';
    return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
  };
  // 用真实图替换风格卡 emoji、参考灵感卡 emoji（基底渲染后用 MutationObserver 兜底处理）
  function imgOf(name,list){var it=(list||[]).find(function(x){return x.name===name;});return it&&it.img;}
  function enhance(){
    document.querySelectorAll(".logo-style").forEach(function(el){
      var nm=el.getAttribute("data-style"), src=imgOf(nm,DATA.logoStyles), th=el.querySelector(".ls-thumb");
      if(src&&th&&!th.querySelector("img")){th.innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:cover"/>';th.style.padding="0";}
    });
    document.querySelectorAll(".lg-case").forEach(function(el){
      var nm=(el.querySelector(".lg-case-name")||{}).textContent, src=imgOf(nm,DATA.logoCases), th=el.querySelector(".lg-case-thumb"), em=el.querySelector(".lg-case-emoji");
      if(src&&em&&!th.querySelector("img")){em.style.display="none";var im=document.createElement("img");im.src=src;im.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover";th.insertBefore(im,th.firstChild);}
    });
  }
  var mo=new MutationObserver(function(){enhance();});
  document.addEventListener("DOMContentLoaded",function(){enhance();mo.observe(document.getElementById("main")||document.body,{childList:true,subtree:true});});
})();
</script>
`;
html = html.replace("</body>", patch + "</body>");

fs.writeFileSync(OUT, html, "utf8");
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log("已生成整站单文件:", OUT, "(" + mb + " MB)");
