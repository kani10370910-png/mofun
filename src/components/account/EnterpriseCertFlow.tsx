"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { resolveRegionIdFromText } from "@/data/regionAssets";

type CertStep = "intro" | "detect" | "verify" | "entity" | "done";

const FLOW_STEPS = [
  { key: "verify", title: "原认证主体校验", desc: "确认本人有权变更" },
  { key: "entity", title: "变更认证主体", desc: "提交企业主体信息" },
  { key: "done", title: "主体变更完成", desc: "升级为企业版" },
] as const;

const NOTICES = [
  "变更过程中，原个人主体仍有效；变更完成前暂不可开通企业级席位与组织协作。",
  "创作资产、权益与账单在变更成功前归属原个人账号，成功后转移至企业主体。",
  "变更申请可在流程中撤回，撤回后账号恢复为个人版状态。",
];

/** 对齐火山「猜你想问」：个人升级企业认证常见问题 */
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "个人版和企业版有什么区别？",
    a: "个人版仅本人账号，无成员席位；企业版完成认证后可管理成员与组织级本地增强协作。",
  },
  {
    q: "变更过程中原来的个人认证还有效吗？",
    a: "有效。变更完成前仍按个人主体使用；完成后主体切换为企业，创作资产与权益归新企业主体。",
  },
  {
    q: "可以中途撤回吗？",
    a: "可以。在主体变更完成前可随时关闭流程或在组织信息中退出认证，账号恢复为个人版。",
  },
  {
    q: "原认证主体校验要填什么？",
    a: "核验当前操作人是否为原个人主体本人。演示环境填写原认证姓名，身份证号后四位可填 DEMO。",
  },
  {
    q: "企业主体需要准备哪些材料？",
    a: "企业名称、统一社会信用代码、法人姓名与身份证号，以及营业执照扫描件（演示可只上传文件名）。",
  },
  {
    q: "认证大概要多久？",
    a: "正式环境一般为资料提交后人工/自动审核；当前演示流程提交后即时通过并升级为企业版。",
  },
  {
    q: "认证失败或信息填错怎么办？",
    a: "可返回上一步修改后重提；已升级成功的可在组织信息点击「退出认证」恢复个人版后再重新发起。",
  },
];

export function EnterpriseCertFlow({
  open,
  onClose,
  defaultName,
}: {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
}) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState<CertStep>("intro");
  const [agreed, setAgreed] = useState(false);
  const [showAgree, setShowAgree] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [detecting, setDetecting] = useState(false);
  const [detectOk, setDetectOk] = useState(false);

  const [realName, setRealName] = useState("");
  const [idLast4, setIdLast4] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [companyName, setCompanyName] = useState(defaultName || "");
  const [companyAddress, setCompanyAddress] = useState("");
  const [creditCode, setCreditCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [legalId, setLegalId] = useState("");
  const [licenseName, setLicenseName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("intro");
    setAgreed(false);
    setShowAgree(false);
    setShowFaq(false);
    setFaqOpen(0);
    setDetecting(false);
    setDetectOk(false);
    setRealName(user?.realName || "");
    setIdLast4("");
    setVerifyBusy(false);
    setCompanyName(defaultName || user?.orgName || "");
    setCompanyAddress(user?.address || "");
    setCreditCode("");
    setLegalName("");
    setLegalId("");
    setLicenseName("");
    setBusy(false);
    // 仅在打开弹窗时重置；提交成功后的 updateUser 不得把「完成」页打回引导页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 打开时同步默认企业名（不重置当前步骤）
  useEffect(() => {
    if (!open || step !== "intro") return;
    if (defaultName) setCompanyName(defaultName);
  }, [open, defaultName, step]);

  if (!open) return null;

  function startDetect() {
    if (!user?.personalVerified) {
      toast("请先完成个人实名认证后再变更企业主体", "warn");
      onClose();
      return;
    }
    if (!agreed) {
      toast("请先阅读并同意变更协议", "warn");
      return;
    }
    setStep("detect");
    setDetecting(true);
    setDetectOk(false);
    window.setTimeout(() => {
      setDetecting(false);
      setDetectOk(true);
    }, 900);
  }

  function onVerifyOriginal() {
    if (!realName.trim()) {
      toast("请填写原认证姓名", "warn");
      return;
    }
    if (!/^\d{4}$/.test(idLast4.trim()) && idLast4.trim().toUpperCase() !== "DEMO") {
      toast("请填写身份证号后四位（演示可填 DEMO）", "warn");
      return;
    }
    setVerifyBusy(true);
    window.setTimeout(() => {
      setVerifyBusy(false);
      toast("原主体校验通过");
      setStep("entity");
    }, 500);
  }

  function onSubmitEntity() {
    if (!companyName.trim()) {
      toast("请填写企业名称", "warn");
      return;
    }
    const address = companyAddress.trim();
    if (!address) {
      toast("请填写企业注册地址（用于确定所属区县）", "warn");
      return;
    }
    if (!creditCode.trim()) {
      toast("请填写统一社会信用代码", "warn");
      return;
    }
    if (!legalName.trim()) {
      toast("请填写法人姓名", "warn");
      return;
    }
    if (!legalId.trim()) {
      toast("请填写法人身份证号", "warn");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const name = companyName.trim();
      const regionId = resolveRegionIdFromText([address, name].join(" "));
      updateUser({
        enterpriseVerified: true,
        personalVerified: true,
        orgName: name,
        company: name,
        address,
        regionId,
        realName: legalName.trim() || realName.trim() || user?.realName,
        planLabel: "企业版",
        roleBadge: "企业版",
        roleTitle: "企业管理员",
        memberCount: "1/10",
      });
      setBusy(false);
      setStep("done");
      toast("企业认证已完成，已升级为企业版");
    }, 500);
  }

  const activeFlowIndex =
    step === "intro" || step === "detect" ? -1 : step === "verify" ? 0 : step === "entity" ? 1 : 2;

  return (
    <div className="am-cs-overlay" role="dialog" aria-modal="true" aria-labelledby="am-cert-title">
      <button type="button" className="am-cs-backdrop" aria-label="关闭" onClick={onClose} />
      <div className={`am-cert-flow${step === "intro" || step === "done" ? " is-wide" : ""}`}>
        <header className="am-cert-flow-head">
          <button
            type="button"
            className="am-cert-flow-back"
            onClick={() => {
              if (step === "intro" || step === "done") onClose();
              else if (step === "detect") setStep("intro");
              else if (step === "verify") setStep("detect");
              else if (step === "entity") setStep("verify");
            }}
            aria-label={step === "done" ? "关闭" : "返回"}
          >
            <Icon name="chevron" size={16} className="am-cert-flow-back-ico" />
          </button>
          <h3 id="am-cert-title">{step === "done" ? "变更完成" : "实名认证"}</h3>
          <button type="button" className="am-cert-flow-help" onClick={() => setShowFaq(true)}>
            猜你想问
          </button>
        </header>

        {step !== "intro" && step !== "done" && (
          <div className="am-cert-mini-steps" aria-hidden>
            {FLOW_STEPS.map((s, i) => (
              <div key={s.key} className={`am-cert-mini-step${i <= activeFlowIndex ? " on" : ""}`}>
                <span>{i + 1}</span>
                {s.title}
              </div>
            ))}
          </div>
        )}

        {step === "intro" && (
          <div className="am-cert-flow-body">
            <div className="am-cert-banner">
              <ol>
                {NOTICES.map((t, i) => (
                  <li key={i}>
                    <b>{i + 1}.</b> {t}
                  </li>
                ))}
              </ol>
            </div>

            <h4 className="am-cert-hero-title">变更为企业认证</h4>
            <p className="am-cert-hero-sub">
              请根据以下步骤修改实名认证，审核通过后即可变更实名信息并升级为企业版。详情请查看{" "}
              <button type="button" className="am-cert-link" onClick={() => setShowAgree(true)}>
                变更为企业认证
              </button>
            </p>

            <div className="am-cert-cubes">
              {FLOW_STEPS.map((s, i) => (
                <div key={s.key} className="am-cert-cube">
                  <div className={`am-cert-cube-ico tone-${i}`}>
                    {i === 0 ? "检" : i === 1 ? "换" : "✓"}
                  </div>
                  <div className="am-cert-cube-title">
                    {i + 1}.{s.title}
                  </div>
                  <div className="am-cert-cube-desc">{s.desc}</div>
                  {i < FLOW_STEPS.length - 1 && <span className="am-cert-cube-arrow">›</span>}
                </div>
              ))}
            </div>

            <label className="am-cert-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                已阅读并同意
                <button type="button" className="am-cert-link" onClick={() => setShowAgree(true)}>
                  《魔方智绘实名认证主体变更协议》
                </button>
              </span>
            </label>

            <button
              type="button"
              className="am-cert-primary"
              disabled={!agreed}
              onClick={startDetect}
            >
              开始检测
            </button>
          </div>
        )}

        {step === "detect" && (
          <div className="am-cert-flow-body">
            <h4 className="am-cert-section-title">变更条件检测</h4>
            <p className="am-cert-hero-sub" style={{ marginBottom: 16 }}>
              系统正在检测账号订单、权益与创作资产是否符合主体变更条件（演示环境默认通过）。
            </p>
            <ul className="am-cert-detect-list">
              {[
                "账号状态正常",
                "无未结清企业协作席位纠纷",
                "创作资产可随主体迁移",
              ].map((item) => (
                <li key={item}>
                  <span className={detectOk ? "ok" : detecting ? "run" : ""}>
                    {detectOk ? "通过" : detecting ? "检测中" : "待检"}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="am-cert-primary"
              disabled={!detectOk}
              onClick={() => setStep("verify")}
            >
              {detectOk ? "继续变更" : detecting ? "检测中…" : "开始检测"}
            </button>
          </div>
        )}

        {step === "verify" && (
          <div className="am-cert-flow-body">
            <h4 className="am-cert-section-title">原认证主体校验</h4>
            <p className="am-cert-hero-sub" style={{ marginBottom: 14 }}>
              为确认操作人有权将个人主体变更为企业主体，请核验原个人认证信息（演示）。
            </p>
            <div className="am-cert-form">
              <input
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="原认证姓名"
                autoFocus
              />
              <input
                value={idLast4}
                onChange={(e) => setIdLast4(e.target.value)}
                placeholder="身份证号后四位（演示可填 DEMO）"
                maxLength={4}
              />
            </div>
            <button
              type="button"
              className="am-cert-primary"
              disabled={verifyBusy}
              onClick={onVerifyOriginal}
            >
              {verifyBusy ? "校验中…" : "提交原主体校验"}
            </button>
          </div>
        )}

        {step === "entity" && (
          <div className="am-cert-flow-body">
            <h4 className="am-cert-section-title">变更认证主体</h4>
            <p className="am-cert-hero-sub" style={{ marginBottom: 14 }}>
              请填写新企业主体信息。提交并通过后，账号将升级为企业版，可使用成员管理与协作能力。
            </p>
            <div className="am-cert-form">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="企业名称"
                autoFocus
              />
              <input
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="企业注册地址，如：浙江省湖州市安吉县"
              />
              <input
                value={creditCode}
                onChange={(e) => setCreditCode(e.target.value)}
                placeholder="统一社会信用代码"
              />
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="法人姓名"
              />
              <input
                value={legalId}
                onChange={(e) => setLegalId(e.target.value)}
                placeholder="法人身份证号"
              />
              <label className="am-cert-upload">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setLicenseName(f ? f.name : "");
                  }}
                />
                <Icon name="upload" size={22} />
                <span>{licenseName || "点击上传营业执照扫描件"}</span>
              </label>
            </div>
            <button
              type="button"
              className="am-cert-primary"
              disabled={busy}
              onClick={onSubmitEntity}
            >
              {busy ? "提交中…" : "提交企业认证"}
            </button>
            <p className="am-cert-foot">用户须知：实名认证仅用于安全风控与企业权益开通</p>
          </div>
        )}

        {step === "done" && (
          <div className="am-cert-flow-body am-cert-done">
            <div className="am-cert-done-ico">✓</div>
            <h4 className="am-cert-section-title">主体变更完成</h4>
            <p className="am-cert-hero-sub">
              已变更为企业认证，账号升级为「企业版」。可在组织信息与成员管理中管理企业成员。
            </p>
            <button type="button" className="am-cert-primary" onClick={onClose}>
              完成
            </button>
          </div>
        )}
      </div>

      {showFaq && (
        <div className="am-cert-agree-overlay" role="dialog" aria-modal="true" aria-label="猜你想问">
          <div className="am-cert-faq-card">
            <div className="am-cert-faq-head">
              <h4>猜你想问</h4>
              <button type="button" className="am-cs-close" onClick={() => setShowFaq(false)} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="am-cert-faq-lead">个人主体变更为企业认证时的常见问题</p>
            <div className="am-cert-faq-list">
              {FAQ_ITEMS.map((item, i) => {
                const openItem = faqOpen === i;
                return (
                  <div key={item.q} className={`am-cert-faq-item${openItem ? " on" : ""}`}>
                    <button
                      type="button"
                      className="am-cert-faq-q"
                      onClick={() => setFaqOpen(openItem ? null : i)}
                    >
                      <span>{item.q}</span>
                      <Icon name="chevron" size={14} className={openItem ? "am-cert-faq-chev open" : "am-cert-faq-chev"} />
                    </button>
                    {openItem && <div className="am-cert-faq-a">{item.a}</div>}
                  </div>
                );
              })}
            </div>
            <button type="button" className="am-cert-primary" onClick={() => setShowFaq(false)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {showAgree && (
        <div className="am-cert-agree-overlay" role="dialog" aria-modal="true">
          <div className="am-cert-agree-card">
            <h4>魔方智绘实名认证主体变更协议</h4>
            <div className="am-cert-agree-body">
              <p>您正在将账号实名主体由个人变更为企业。点击「开始检测」即表示您知悉并同意：</p>
              <p>1. 应按要求提供真实、合法、有效的企业证明材料，否则平台有权拒绝变更。</p>
              <p>
                2. 变更成功后，本账号下的权益（含创作资产、席位与企业协作能力）转移至新企业主体，以系统记录为准。
              </p>
              <p>3. 您可在流程完成前撤回申请；撤回后恢复为个人版，已提交材料失效。</p>
              <p>4. 变更期间请勿进行与席位、组织协作相关的关键操作，以免影响审核。</p>
              <p>5. 存在欠费、冻结或其他纠纷时，平台可不同意本次变更请求。</p>
            </div>
            <button type="button" className="am-cert-primary" onClick={() => setShowAgree(false)}>
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
