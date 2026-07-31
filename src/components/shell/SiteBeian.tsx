/* 网站备案信息（ICP / 公安联网备案） */

const ICP = {
  text: "浙ICP备18026483号-13",
  href: "https://beian.miit.gov.cn/",
};

const POLICE = {
  text: "浙公网安备33010902004747号",
  href: "http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=33010902004747",
};

export function SiteBeian({ className = "" }: { className?: string }) {
  return (
    <footer className={`site-beian ${className}`.trim()}>
      <a href={ICP.href} target="_blank" rel="noreferrer noopener">
        {ICP.text}
      </a>
      <span className="site-beian-sep" aria-hidden>
        ·
      </span>
      <a href={POLICE.href} target="_blank" rel="noreferrer noopener">
        {POLICE.text}
      </a>
    </footer>
  );
}
