const HREF=/\bhref\s*=\s*["']\/(?:wick-coins|early-pump)(?:\.html)?(?:[?#][^"']*)?["']/i;
const ANCHOR=/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi;
const LINK='<a class="nav-link wick-coin-nav-link" href="/wick-coins">Volume kiểu AIN</a><a class="nav-link early-pump-nav-link" href="/early-pump">Bơm sớm</a>';
function stripMenuLink(html){return html.replace(ANCHOR,a=>HREF.test(a)?'':a);}
export function injectWickCoinNavigation(value){
 const html=String(value??'');let menus=0;
 const semantic=html.replace(/<nav\b([^>]*)>([\s\S]*?)<\/nav\s*>/gi,(whole,attrs,body)=>{
  if(/pagination|phân trang/i.test(attrs))return whole;
  menus++;return '<nav'+attrs+'>'+LINK+stripMenuLink(body)+'</nav>';
 });
 if(menus)return semantic;
 const legacy=/<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi;
 const clean=html.replace(legacy,a=>HREF.test(a)?'':a),first=/<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>/i.exec(clean);
 return first?clean.slice(0,first.index)+LINK+clean.slice(first.index):html;
}
