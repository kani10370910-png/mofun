"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { ColorPicker } from "./ColorPicker";
import { useToast } from "@/components/ui/Toast";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { imageRatios, ipExtendTabs, ipExtendPresets, ipPresetPrompts, type IpExtendTab } from "@/data/image";
import { LibraryPickerModal } from "./LibraryPickerModal";
import { ClearableTextarea } from "@/components/ui/ClearableTextarea";
import { imgToDataUrl } from "@/lib/image";

// IP 设计的画面尺寸只显示比例名称，不显示「1080 × 1080 px」；末尾追加「自定义」
const CUSTOM_RATIO = "自定义";
const ratioOpts: DropdownOption[] = [
  ...imageRatios.map((r) => ({ name: r.name, ico: "szSquare" as const })),
  { name: CUSTOM_RATIO, ico: "pencil" },
];

/* 「复制到左侧」回填载荷：把记录的结构化信息带回左侧表单逐项还原 */
export interface IpCopyPayload {
  kind: "create" | "extend";
  desc: string; // 创意描述 / 图片描述词
  colors?: string[]; // 创新设计：偏好颜色
  ratioName?: string; // 创新设计：画面尺寸
  refImg?: string; // 创新设计：参考图（data URL）
  ipImg?: string; // 扩展设计：IP 图（data URL）
}

/* 点「立即生成」后交给父级的载荷：父级据此调文生图并填入右侧画廊 */
export interface IpGenPayload {
  title: string; // 卡片标题（主体/品牌名，取描述前若干字）
  prompt: string; // 优化后的画面描述，作为文生图 prompt
  ratioName: string; // 画面比例名（含「自定义 w:h」）
  // 用户原始输入（供「IP故事」据此生成描述/故事，不依赖识别图片）
  rawDesc?: string; // 用户填写的创意描述原文
  colors?: string[]; // 偏好颜色
  // 图生图参考图：扩展设计传 IP 图，使各延展保持人物一致性。
  // 统一转成 base64 data URL 传给模型（Seedream 接受 data URL），
  // 因此本地 blob: 上传图也能图生图保一致，不再依赖公网 URL。
  refImage?: string;
  // —— 扩展设计的结构化展示信息（生成历史卡片头用，替代裸 prompt 文字）——
  ext?: {
    ipImg: string; // 用户上传的 IP 原图（缩略图展示，可用 ipImgUrl）
    tab: string; // 本次涉及的延展项名（可多项，如「动作、场景」）
    desc?: string; // 图片描述词框内容
    refImg?: string; // 实际传给模型的参考图（data URL）
  };
  // —— IP创新设计的结构化展示信息（卡片头按 参考图→创意描述→偏好颜色→画面尺寸 排列，没填的跳过）——
  create?: {
    refImg?: string; // 用户上传的参考图（无则不展示）
    desc: string; // 创意描述原文
    colors?: string[]; // 偏好颜色
    ratioName?: string; // 画面尺寸名
  };
}


/* IP 设计专属表单：IP创新设计 / IP扩展设计 双 Tab
   onPropose(open, initialDesc?)：点「帮我提案」时通知父级在右侧结果区展示提案面板，
   并把当前创意描述带过去作为初始文本；open=false 表示关闭。 */
export function ImageIpPanel({
  onGenerate,
  loading,
  onPropose,
  proposeFill,
  copyFill,
  fillSeq,
  designTab,
  onDesignTabChange,
  extendSeed,
  onExtendSeedUsed,
}: {
  onGenerate: (payload?: IpGenPayload) => void;
  loading: boolean;
  onPropose?: (open: boolean, initialDesc?: string) => void;
  proposeFill?: string;
  copyFill?: IpCopyPayload | null; // 复制回填的结构化载荷（颜色/尺寸/参考图等）
  fillSeq?: number; // 回填序号，变化即触发回填（内容相同也生效）
  designTab?: "create" | "extend"; // 受控设计 tab（复制时父级据记录类型切换）
  onDesignTabChange?: (t: "create" | "extend") => void;
  extendSeed?: { img: string; name: string } | null;
  onExtendSeedUsed?: () => void;
}) {
  const toast = useToast();
  // 受控优先：父级传了 designTab 就用它，否则用内部 state（向后兼容）
  const [innerTab, setInnerTab] = useState<"create" | "extend">("create");
  const tab = designTab ?? innerTab;
  const setTab = (t: "create" | "extend") => {
    setInnerTab(t);
    onDesignTabChange?.(t);
  };

  // 收到延展种子：自动切到「IP扩展设计」
  useEffect(() => {
    if (extendSeed) setTab("extend");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extendSeed]);

  return (
    <>
      <div className="ev-tabs">
        <span className={tab === "create" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("create")}>
          IP创新设计
        </span>
        <span className={tab === "extend" ? "ev-tab on" : "ev-tab"} onClick={() => setTab("extend")}>
          IP扩展设计
        </span>
      </div>
      {tab === "create" ? (
        <IpCreate
          onGenerate={onGenerate}
          loading={loading}
          onPropose={onPropose}
          proposeFill={proposeFill}
          copyFill={copyFill}
          fillSeq={fillSeq}
        />
      ) : (
        <IpExtend
          onGenerate={onGenerate}
          loading={loading}
          toast={toast}
          extendSeed={extendSeed}
          onExtendSeedUsed={onExtendSeedUsed}
          proposeFill={proposeFill}
          copyFill={copyFill}
          fillSeq={fillSeq}
        />
      )}
    </>
  );
}

/* ---------------- IP 创新设计 ---------------- */
function IpCreate({
  onGenerate,
  loading,
  onPropose,
  proposeFill,
  copyFill,
  fillSeq,
}: {
  onGenerate: (payload?: IpGenPayload) => void;
  loading: boolean;
  onPropose?: (open: boolean, initialDesc?: string) => void;
  proposeFill?: string;
  copyFill?: IpCopyPayload | null;
  fillSeq?: number;
}) {
  const toast = useToast();
  const [desc, setDesc] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [ratio, setRatio] = useState(imageRatios[0].name);
  // 自定义画面比例的宽 : 高
  const [cw, setCw] = useState("1");
  const [ch, setCh] = useState("1");
  const isCustomRatio = ratio === CUSTOM_RATIO;
  // 参考图：选中后存预览 URL；uploaded 由是否有图派生
  const [refUrl, setRefUrl] = useState("");
  const uploaded = !!refUrl;
  const refInputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [current, setCurrent] = useState("#000000");
  const colorBoxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  // 创意描述输入框：随内容增多自动向下变高
  const descRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [desc]);

  // 回填创意描述：提案面板「开始生成」、生成历史「复制」均经 proposeFill。
  // 依赖 fillSeq —— 每次复制都 +1，即使内容相同也能重新回填。
  useEffect(() => {
    if (proposeFill && proposeFill.trim()) setDesc(proposeFill.trim());
    // 复制带来的结构化信息：还原偏好颜色 / 画面尺寸 / 参考图
    if (copyFill && copyFill.kind === "create") {
      if (copyFill.colors) setColors(copyFill.colors);
      // 画面尺寸：命中预设比例名才设；自定义/未命中则保持当前
      if (copyFill.ratioName && imageRatios.some((r) => r.name === copyFill.ratioName)) {
        setRatio(copyFill.ratioName);
      }
      if (copyFill.refImg) {
        // 旧本地预览 URL 释放后填入复制来的参考图（data URL，可直接展示）
        setRefUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return copyFill.refImg || "";
        });
      }
    }
    // 复制回填后滚动到「创意描述」处，让用户看到刚填的内容
    if (fillSeq) {
      requestAnimationFrame(() =>
        descRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeFill, fillSeq]);

  // 离开 IP创新设计（卸载）时，关闭右侧提案面板
  useEffect(() => {
    return () => onPropose?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卸载时释放参考图的预览 URL，避免内存泄漏
  const refUrlRef = useRef(refUrl);
  refUrlRef.current = refUrl;
  useEffect(() => {
    return () => {
      if (refUrlRef.current) URL.revokeObjectURL(refUrlRef.current);
    };
  }, []);

  // 创意描述优化：调 LLM 把用户描述扩写成详细的图像 prompt（结果仅后台使用，不展示）
  const opt = useGenerateStream();

  // 点「立即生成」：先在后台优化创意描述，完成后再触发图片生成
  async function handleGenerate() {
    if (!desc.trim()) {
      toast("请输入创意描述！", "warn");
      return;
    }
    // 自定义比例需为正整数
    if (isCustomRatio && (!Number(cw) || !Number(ch))) {
      toast("请填写有效的自定义宽高比例！", "warn");
      return;
    }
    const canvasSize = isCustomRatio ? `自定义 ${cw}:${ch}` : ratio;
    const full = await opt.generate({
      scene: "ip",
      description: desc.trim(),
      preferredColors: colors,
      canvasSize,
      hasReference: uploaded,
    });
    if (opt.state.error) {
      toast(opt.state.error, "warn");
      return;
    }
    if (full.trim()) {
      // 标题：优先取描述里「」/引号内文字，否则取前 8 字
      const m = desc.match(/[「“"'『]([^」”"'』]{1,12})[」”"'』]/);
      const title = (m?.[1] || desc.trim().slice(0, 8) || "IP 形象").trim();
      // 参考图转 data URL 供卡片头缩略展示（有上传才转）
      const refImg = uploaded && refUrl ? await imgToDataUrl(refUrl) : "";
      // full 即优化后的画面描述（不展示给用户），作为文生图 prompt 交给父级出图；
      // 同时把用户原始创意描述 + 颜色带上，供「IP故事」据此生成（不识别图片）
      onGenerate({
        title,
        prompt: full.trim(),
        ratioName: canvasSize,
        rawDesc: desc.trim(),
        colors,
        create: {
          refImg: refImg || undefined,
          desc: desc.trim(),
          colors: colors.length ? colors : undefined,
          ratioName: canvasSize,
        },
      });
    }
  }

  // 收起取色器：把当前色加入色块列表
  function closePicker() {
    setColors((prev) => [...prev, currentRef.current]);
    setPicking(false);
  }

  function togglePicker() {
    if (picking) closePicker();
    else setPicking(true);
  }

  // 取色器展开时，点击其外部 = 选中当前色并收起
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (colorBoxRef.current && !colorBoxRef.current.contains(e.target as Node)) {
        closePicker();
      }
    };
    // 延后挂载，避免点「+」打开的同一次事件立即触发关闭
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label">创意描述 <span className="req">*</span></div>
        <div className="ip-desc-wrap">
          <textarea
            ref={descRef}
            className="ip-desc"
            style={{ resize: "none", overflow: "hidden" }}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={`例：「稻小金」——拟人化金色稻穗，头戴斗笠，圆眼弯眉，憨厚微笑，身穿汉服马甲，手持丰收镰刀。象征丰收喜悦，专属某县农业局品牌IP。`}
          />
          <button className="ip-propose-btn" onClick={() => onPropose?.(true, desc)}>
            <Icon name="sparkle" size={14} /> 帮我提案
          </button>
          {desc.trim() && (
            <button type="button" className="ta-clear" onClick={() => setDesc("")}>
              清空
            </button>
          )}
        </div>
        {/* AI 优化后的画面描述仅在后台用于生成图片，不展示给用户 */}
      </div>

      <div className="field ip-color-field" ref={colorBoxRef}>
        <div className="ws-label">偏好颜色</div>
        <div className="ip-colors">
          <button className="ip-color-add" onClick={togglePicker} title={picking ? "完成" : "添加颜色"}>
            <Icon name="plus" size={16} />
          </button>
          {/* 已添加的色块 */}
          {colors.map((c, i) => (
            <span
              key={i}
              className="ip-color-chip"
              style={{ background: c }}
              title={c}
              onClick={() => setColors((prev) => prev.filter((_, j) => j !== i))}
            >
              <span className="ip-color-x">×</span>
            </span>
          ))}
          {/* 取色中的当前色预览 */}
          {picking && <span className="ip-color-chip ip-color-current" style={{ background: current }} />}
        </div>
        {picking && <ColorPicker value={current} onChange={setCurrent} />}
      </div>

      <div className="field">
        <div className="ws-label">画面尺寸</div>
        <Dropdown title="画面尺寸" options={ratioOpts} value={ratio} onChange={(o) => setRatio(o.name)} />
        {/* 选「自定义」时出现 宽 : 高 比例输入 */}
        {isCustomRatio && (
          <div className="ip-ratio-custom">
            <label className="ip-ratio-box">
              <span className="ip-ratio-tag">宽</span>
              <input
                type="text"
                inputMode="numeric"
                value={cw}
                onChange={(e) => setCw(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                aria-label="宽度比例"
              />
            </label>
            <span className="ip-ratio-colon">:</span>
            <label className="ip-ratio-box">
              <span className="ip-ratio-tag">高</span>
              <input
                type="text"
                inputMode="numeric"
                value={ch}
                onChange={(e) => setCh(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                aria-label="高度比例"
              />
            </label>
          </div>
        )}
      </div>

      <div className="field">
        <div className="ws-label">参考</div>
        <input
          ref={refInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (refUrl) URL.revokeObjectURL(refUrl);
              setRefUrl(URL.createObjectURL(f));
              toast(`已选择参考图：${f.name}`);
            }
            e.target.value = ""; // 允许再次选择同一文件
          }}
        />
        <div
          className={`upload-box ${uploaded ? "filled ip-ref-filled" : ""}`}
          onClick={() => !uploaded && refInputRef.current?.click()}
          title={uploaded ? undefined : "上传参考图"}
        >
          {uploaded ? (
            <>
              {/* 真实参考图预览 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ip-ref-img" src={refUrl} alt="参考图预览" />
              {/* 鼠标移入：中央浮出「更换 / 删除」两个图标 */}
              <div className="ip-ref-actions">
                <button
                  className="ip-ref-act"
                  onClick={(e) => {
                    e.stopPropagation();
                    refInputRef.current?.click();
                  }}
                  title="更换参考图"
                  aria-label="更换参考图"
                >
                  <Icon name="upload" size={18} />
                </button>
                <button
                  className="ip-ref-act"
                  onClick={(e) => {
                    e.stopPropagation();
                    URL.revokeObjectURL(refUrl);
                    setRefUrl("");
                  }}
                  title="删除参考图"
                  aria-label="删除参考图"
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="ub-ico">
                <Icon name="plus" size={26} />
              </span>
              <div className="ub-main">上传参考，支持图片</div>
            </>
          )}
        </div>
      </div>

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading || opt.state.loading} onClick={handleGenerate}>
          {opt.state.loading ? "正在优化描述…" : "立即生成"} <span className="btn-credit">80算力</span>
        </button>
      </div>
    </>
  );
}

/* 把 LLM 返回的「方案一：… 方案二：… 方案三：…」文本解析成方案数组。
   兼容「方案一：」「方案1：」「方案一 」等写法；解析不出时整体作为一个方案兜底。 */
function parseProposals(text: string): { full: string }[] {
  const t = text.trim();
  if (!t) return [];
  // 按「方案X：」切分，保留分隔点后的内容
  const parts = t
    .split(/\n*\s*方案[一二三四五六七八九十\d]+[：:、.\s]*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.map((full) => ({ full }));
  // 兜底：按空行分段
  const segs = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (segs.length >= 2) return segs.map((full) => ({ full }));
  return [{ full: t }];
}

/* 「帮我提案」面板：内嵌渲染在右侧结果区（不再是居中弹窗）。
   三阶段：form 填写 → loading 生成中 → result 三套设计提案。
   initialText：打开时把左侧创意描述的已有内容复制进来作为初始值。
   选中某套方案后通过 onGenerate 回填到左侧创意描述并关闭面板。 */
export function ProposePanel({
  onClose,
  onGenerate,
  initialText = "",
}: {
  onClose: () => void;
  onGenerate: (text: string) => void;
  initialText?: string;
}) {
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"form" | "loading" | "result">("form");
  const [proposals, setProposals] = useState<{ full: string }[]>([]);
  const empty = !text.trim();

  // 帮我提案：调 LLM 按「IP 特征」生成三个设计方案
  const opt = useGenerateStream();

  // 点击面板以外的区域：关闭面板（延后挂载，避免打开它的同一次点击立即关闭）
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGo() {
    if (empty) {
      toast("请输入画面描述！", "warn");
      return;
    }
    setStage("loading");
    // 调 LLM：以输入文本作为「IP 特征」生成三个设计方案
    const full = await opt.generate({ scene: "ip-propose", description: text.trim() });
    if (opt.state.error) {
      toast(opt.state.error, "warn");
      setStage("form");
      return;
    }
    const list = parseProposals(full);
    if (list.length === 0) {
      toast("提案生成为空，请重试。", "warn");
      setStage("form");
      return;
    }
    setProposals(list);
    setStage("result");
  }

  // 点右上角「引用」：把该方案完整内容回填到左侧创意描述
  function pickProposal(p: { full: string }) {
    onGenerate(p.full);
  }

  // 结果阶段：设计提案列表（hover 弹出完整描述预览，点右上角引用按钮回填）
  if (stage === "result") {
    return (
      <div className="propose-pane">
        <div className="propose-panel" ref={panelRef}>
          <div className="propose-head">
            <span className="propose-title">
              <button className="propose-back" onClick={() => setStage("form")} aria-label="返回">
                <Icon name="chevron" size={16} className="ico-rot90" />
              </button>
              设计提案
            </span>
            <button className="bf-close" onClick={onClose} aria-label="关闭">
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="propose-list">
            {proposals.map((p, i) => (
              <div key={i} className="propose-item">
                <div className="propose-item-head">
                  <div className="propose-item-name">方案{["一", "二", "三"][i] ?? i + 1}：</div>
                  <button
                    className="propose-cite"
                    onClick={() => pickProposal(p)}
                    title="引用到创意描述"
                    aria-label="引用到创意描述"
                  >
                    ↵
                  </button>
                </div>
                <div className="propose-item-short">{p.full}</div>
                {/* hover 预览：完整内容 */}
                <div className="propose-tip">{p.full}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 填写 / 生成中阶段
  const loading = stage === "loading";
  return (
    <div className="propose-pane">
      <div className="propose-panel" ref={panelRef}>
        <div className="propose-head">
          <span className="propose-title">
            <Icon name="sparkle" size={16} /> 帮我提案
          </span>
          <button className="bf-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <ClearableTextarea
          className="ip-desc"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClear={() => setText("")}
          placeholder="请输入画面描述"
          disabled={loading}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFileName(f.name);
              toast(`已选择：${f.name}`);
            }
          }}
        />
        <div
          className={`upload-box ${fileName ? "filled" : ""}`}
          style={{ marginTop: 12 }}
          onClick={() => !loading && fileRef.current?.click()}
        >
          <span className="ub-ico">
            <Icon name="plus" size={22} />
          </span>
          <div className="ub-main">{fileName || "上传项目资料，让 IP 更符合项目内容，支持 PDF / TXT"}</div>
        </div>
        <button
          className={`btn btn-block propose-go${empty && !loading ? " is-disabled" : ""}`}
          onClick={handleGo}
          disabled={loading}
        >
          {loading ? (
            <span className="propose-loading"><Icon name="refresh" size={15} className="ico-spin" /> 生成中</span>
          ) : (
            "开始生成"
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------------- IP 扩展设计 ---------------- */
function IpExtend({
  onGenerate,
  loading,
  toast,
  extendSeed,
  onExtendSeedUsed,
  proposeFill,
  copyFill,
  fillSeq,
}: {
  onGenerate: (payload?: IpGenPayload) => void;
  loading: boolean;
  toast: (s: string, kind?: "warn") => void;
  extendSeed?: { img: string; name: string } | null;
  onExtendSeedUsed?: () => void;
  proposeFill?: string;
  copyFill?: IpCopyPayload | null;
  fillSeq?: number;
}) {
  // 每个延展项各记一个选中预设（默认未选 = 该项第一个预设「不使用预设」）
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [extDesc, setExtDesc] = useState("");
  // 各延展项已选预设对应的提示词段（按类别存，拼接成「图片描述词」；同类换选替换、不使用预设清除）
  const [segments, setSegments] = useState<Partial<Record<IpExtendTab, string>>>({});
  // 「自定义视角」3D 控制：水平旋转(yaw)/垂直角度(pitch)/拍摄距离(dist)
  const [yaw, setYaw] = useState(0); // -180 ~ 180
  const [pitch, setPitch] = useState(0); // -30 ~ 60
  const [dist, setDist] = useState(1); // 0.6 ~ 1.4

  // 上传 IP 图（必填）与参考图：真实文件选择 + 预览
  const [ipImgUrl, setIpImgUrl] = useState("");
  const [refImgUrl, setRefImgUrl] = useState("");
  // 该 IP 图是否来自「延展设计」带入（远程 URL，卸载/替换时不可 revokeObjectURL）
  const [ipFromSeed, setIpFromSeed] = useState(false);
  const [ipName, setIpName] = useState("");
  const [ipImgError, setIpImgError] = useState(false); // 远程种子图加载失败
  const [libOpen, setLibOpen] = useState(false); // 「仓库」选图弹窗
  const ipInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const descFieldRef = useRef<HTMLDivElement>(null); // 复制回填后滚动定位到图片描述词

  // 从仓库选一张图作为 IP 图（远程 URL，按种子图处理，替换/卸载时不 revoke）
  function pickFromLibrary(url: string, libName: string) {
    if (ipImgUrl && !ipFromSeed) URL.revokeObjectURL(ipImgUrl);
    setIpImgUrl(url);
    setIpFromSeed(true);
    setIpName(libName);
    setIpImgError(false);
    toast(`已从仓库选用「${libName}」作为 IP 图`);
  }

  // 收到「延展设计」带来的 IP 图：填入预览（远程 URL，不走 createObjectURL）
  useEffect(() => {
    if (!extendSeed) return;
    setIpImgUrl((prev) => {
      // 替换前若旧图是本地 object URL 则释放
      if (prev && !ipFromSeed) URL.revokeObjectURL(prev);
      return extendSeed.img;
    });
    setIpFromSeed(true);
    setIpName(extendSeed.name);
    setIpImgError(false);
    onExtendSeedUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extendSeed]);

  // 生成历史「复制描述到左侧」：回填图片描述词 + 还原 IP 图（参考图）
  // 依赖 fillSeq —— 每次复制都 +1，即使内容相同也能重新回填。
  useEffect(() => {
    if (proposeFill && proposeFill.trim()) setExtDesc(proposeFill.trim());
    if (copyFill && copyFill.kind === "extend" && copyFill.ipImg) {
      // 复制来的 IP 图是 data URL，按种子图处理（替换/卸载时不 revoke）
      setIpImgUrl((prev) => {
        if (prev && !ipFromSeed) URL.revokeObjectURL(prev);
        return copyFill.ipImg || "";
      });
      setIpFromSeed(true);
      setIpImgError(false);
    }
    // 复制回填后滚动到「图片描述词」处，让用户看到刚填的内容
    if (fillSeq) {
      requestAnimationFrame(() =>
        descFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeFill, fillSeq]);

  // 卸载时释放本地预览 URL（远程种子 URL 不释放）
  const urlsRef = useRef({ ip: "", ref: "", ipFromSeed: false });
  urlsRef.current = { ip: ipImgUrl, ref: refImgUrl, ipFromSeed };
  useEffect(() => {
    return () => {
      if (urlsRef.current.ip && !urlsRef.current.ipFromSeed) URL.revokeObjectURL(urlsRef.current.ip);
      if (urlsRef.current.ref) URL.revokeObjectURL(urlsRef.current.ref);
    };
  }, []);

  // 扩展设计不走 LLM 优化：直接用拼装的 description 图生图保人物一致

  // 展示用的全部延展项（去掉「周边」，纵向铺开）
  const extTabs = ipExtendTabs.filter((t) => t !== "周边");
  // 某延展项当前选中的预设（默认该项第一个预设）
  const pickOf = (t: IpExtendTab) => picks[t] ?? ipExtendPresets[t][0];
  // 视角组当前是否选中「自定义视角」
  const isCustomView = pickOf("视角") === "自定义视角";

  // 把 3D 控制参数翻译成自然语言视角描述
  function customViewPrompt(): string {
    const ya = Math.round(yaw);
    const yawDesc =
      ya === 0 ? "正面" : ya === 180 || ya === -180 ? "背面" : ya > 0 ? `向右旋转 ${ya}°` : `向左旋转 ${-ya}°`;
    const pi = Math.round(pitch);
    const pitchDesc = pi === 0 ? "平视" : pi < 0 ? `俯视 ${-pi}°` : `仰视 ${pi}°`;
    const distDesc = dist <= 0.75 ? "特写（贴近主体）" : dist >= 1.25 ? "广角（远景全身带环境）" : "全身（完整呈现人物）";
    return `自定义视角：水平${yawDesc}、${pitchDesc}，拍摄距离为${distDesc}（约 ${dist.toFixed(1)}）`;
  }

  // 「图片描述词」各类段的拼接顺序（按首次选择的先后；同类换选保持原位，不使用预设则移除）
  const segOrderRef = useRef<IpExtendTab[]>([]);

  // 点击某延展项 tab 的预设：更新该类提示词段，拼接进「图片描述词」。
  // - 选某预设：该类段替换为对应提示词（首次出现则追加在末尾，同类换选保持原位）
  // - 「不使用预设」：移除该类段
  function pickPreset(tab: IpExtendTab, p: string) {
    setPicks((prev) => ({ ...prev, [tab]: p }));
    const prompt = ipPresetPrompts[tab]?.[p] ?? "";

    setSegments((prev) => {
      const next = { ...prev };
      if (prompt) {
        if (!segOrderRef.current.includes(tab)) segOrderRef.current.push(tab);
        next[tab] = prompt;
      } else {
        // 不使用预设 / 无配置：移除该类段
        delete next[tab];
        segOrderRef.current = segOrderRef.current.filter((t) => t !== tab);
      }
      // 按既定顺序拼接所有类别的段
      const joined = segOrderRef.current
        .map((t) => next[t])
        .filter((s): s is string => !!s)
        .join(" ");
      setExtDesc(joined);
      return next;
    });
  }

  // 选文件通用：存预览 URL 并释放旧的（旧图是远程种子 URL 时不释放）
  function onPickFile(
    e: React.ChangeEvent<HTMLInputElement>,
    set: (u: string) => void,
    prevUrl: string,
    label: string,
    prevIsRemote = false,
  ) {
    const f = e.target.files?.[0];
    if (f) {
      if (prevUrl && !prevIsRemote) URL.revokeObjectURL(prevUrl);
      set(URL.createObjectURL(f));
      toast(`已选择${label}：${f.name}`);
    }
    e.target.value = "";
  }

  // 选/换 IP 图：用户手动上传后即非种子来源
  function onPickIpImg(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) {
      setIpFromSeed(false);
      setIpName("");
    }
    onPickFile(e, setIpImgUrl, ipImgUrl, "IP 图", ipFromSeed);
  }

  // 删除 IP 图：远程种子图不 revoke
  function clearIpImg() {
    if (ipImgUrl && !ipFromSeed) URL.revokeObjectURL(ipImgUrl);
    setIpImgUrl("");
    setIpFromSeed(false);
    setIpName("");
  }

  // 点「立即生成」：校验 IP 图必填 → 组装延展描述 → LLM 优化 → 交父级出图
  async function handleExtGenerate() {
    if (!ipImgUrl) {
      toast("请先上传 IP 图！", "warn");
      return;
    }
    // 本次实际涉及的延展项（标题列全）：
    // - 视角：选了非「不使用预设」即算（自定义视角也算）
    // - 场景/动作/表情/服装：已选预设的（记录在 segOrderRef）
    const viewPick = pickOf("视角");
    const viewActive = viewPick && viewPick !== "不使用预设";
    const activeTabs = extTabs.filter(
      (t) => segOrderRef.current.includes(t) || (t === "视角" && viewActive),
    );
    // 兜底：一个都没选时用「视角」，至少展示一项
    const tabsLabel = (activeTabs.length ? activeTabs : ["视角"]).join("、");

    // 组装：延展类型 + 视角 + 已累加的图片描述词。
    // 强一致性约束（图生图会传原图作参考）：必须保持与原 IP 形象完全相同的脸型、五官、发型/发色、
    // 服饰风格与配色，仅按延展项改变视角/场景/动作/表情/服装，绝不更换人物身份。
    const parts = [
      `对已有 IP 形象做「${tabsLabel}」延展。【人物一致性要求】严格保持与参考图完全相同的角色身份：` +
        `相同的脸型、五官、表情特征、发型与发色、体型比例与整体风格，配色与服饰细节一致，` +
        `仅按本次延展项改变${tabsLabel}，不得更换人物、不得改变性别与年龄`,
    ];
    // 视角单独处理（不进图片描述词）：自定义视角用 3D 参数，否则用所选视角名
    if (viewActive) parts.push(isCustomView ? customViewPrompt() : `视角：${viewPick}`);
    // 场景/动作/表情/服装的预设提示词已累加在 extDesc
    if (extDesc.trim()) parts.push(extDesc.trim());
    const description = parts.join("；");

    // 扩展设计不走 LLM 系统提示词优化：核心是图生图保持人物一致，
    // 直接用拼装好的 description 作为提示词发给文生图，避免改写丢失一致性细节。
    const title = ipName ? `${ipName} · ${tabsLabel}延展` : `IP 延展 · ${tabsLabel}`;
    // 图生图保持人物一致性：把 IP 图统一转成 base64 data URL 作参考图，
    // 本地上传图（blob:）也能保一致，不再依赖公网 URL。转换失败才退回纯文生图。
    const refImage = (await imgToDataUrl(ipImgUrl)) || undefined;
    if (!refImage) toast("参考图读取失败，本次将不保证人物一致", "warn");
    // ipImg 存 data URL（refImage）而非临时的 ipImgUrl（blob: 会失效），保证卡片缩略与复制回填长期有效
    onGenerate({
      title,
      prompt: description,
      ratioName: "正方形 1:1",
      rawDesc: description,
      refImage,
      ext: { ipImg: refImage || ipImgUrl, tab: tabsLabel, desc: extDesc.trim() || undefined, refImg: refImage },
    });
  }

  return (
    <>
      <div className="ws-scroll">
      <div className="field">
        <div className="ws-label-row">
          <div className="ws-label">上传 IP 图 <span className="req">*</span></div>
          <a className="ws-link" onClick={() => setLibOpen(true)}>
            仓库
          </a>
        </div>
        <input
          ref={ipInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onPickIpImg}
        />
        <div
          className={`upload-box ${ipImgUrl ? "filled ip-ref-filled" : ""}`}
          style={ipImgUrl ? undefined : { minHeight: 140 }}
          onClick={() => !ipImgUrl && ipInputRef.current?.click()}
          title={ipImgUrl ? undefined : "上传 IP 图片"}
        >
          {ipImgUrl ? (
            <>
              {ipImgError ? (
                <span className="ip-ref-broken">
                  <Icon name="image" size={30} />
                  图片已失效，请重新上传
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="ip-ref-img"
                  src={ipImgUrl}
                  alt="IP 图预览"
                  onError={() => setIpImgError(true)}
                />
              )}
              {ipFromSeed && ipName && <span className="ip-seed-tag">来自：{ipName}</span>}
              <div className="ip-ref-actions">
                <button className="ip-ref-act" onClick={(e) => { e.stopPropagation(); ipInputRef.current?.click(); }} title="更换 IP 图" aria-label="更换 IP 图">
                  <Icon name="upload" size={18} />
                </button>
                <button className="ip-ref-act" onClick={(e) => { e.stopPropagation(); clearIpImg(); }} title="删除 IP 图" aria-label="删除 IP 图">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="ub-ico">
                <Icon name="plus" size={28} />
              </span>
              <div className="ub-main">上传 IP 图片</div>
            </>
          )}
        </div>
      </div>

      <div className="field">
        <div className="ws-label">延展项</div>
        {/* 各延展项纵向铺开：每项一个标题 + 预设组，上下滚动查看（「周边」已移至生成信息弹窗） */}
        {extTabs.map((t) => (
          <div className="ip-ext-section" key={t}>
            <div className="ip-ext-section-title">{t}</div>
            <div className="ip-preset-grid">
              {ipExtendPresets[t].map((p) => (
                <button
                  key={p}
                  className={pickOf(t) === p ? "ip-preset on" : "ip-preset"}
                  onClick={() => pickPreset(t, p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* 视角组：选中「自定义视角」时展示 3D 视角控制器 + 三个滑块 */}
            {t === "视角" && isCustomView && (
              <div className="cv-panel">
            {/* 球体方向盘：四向点按微调，中心方块为当前朝向 */}
            <div className="cv-orb">
              <button className="cv-arrow up" aria-label="上仰" onClick={() => setPitch((v) => Math.min(60, v + 5))}>
                <Icon name="chevron" size={16} />
              </button>
              <button className="cv-arrow down" aria-label="下俯" onClick={() => setPitch((v) => Math.max(-30, v - 5))}>
                <Icon name="chevron" size={16} />
              </button>
              <button className="cv-arrow left" aria-label="左转" onClick={() => setYaw((v) => Math.max(-180, v - 15))}>
                <Icon name="chevron" size={16} />
              </button>
              <button className="cv-arrow right" aria-label="右转" onClick={() => setYaw((v) => Math.min(180, v + 15))}>
                <Icon name="chevron" size={16} />
              </button>
              <span className="cv-orb-center" />
            </div>

            <div className="cv-slider">
              <div className="cv-slider-head">
                <span className="ws-label">水平旋转</span>
                <span className="cv-val">{Math.round(yaw)}°</span>
              </div>
              <div className="cv-hint">正面(0°)，右(90°)，背(180°)，左(−90°)</div>
              <input type="range" min={-180} max={180} step={5} value={yaw} onChange={(e) => setYaw(Number(e.target.value))} />
            </div>

            <div className="cv-slider">
              <div className="cv-slider-head">
                <span className="ws-label">垂直角度</span>
                <span className="cv-val">{Math.round(pitch)}°</span>
              </div>
              <div className="cv-hint">俯视(−30°)，平视(0°)，仰视(60°)</div>
              <input type="range" min={-30} max={60} step={5} value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
            </div>

            <div className="cv-slider">
              <div className="cv-slider-head">
                <span className="ws-label">拍摄距离</span>
                <span className="cv-val">{dist.toFixed(1)}</span>
              </div>
              <div className="cv-hint">特写(0.6)，全身(1.0)，广角(1.4)</div>
              <input type="range" min={0.6} max={1.4} step={0.1} value={dist} onChange={(e) => setDist(Number(e.target.value))} />
            </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 图片描述词 + 上传参考图（所有延展项共用） */}
      <div className="field" ref={descFieldRef}>
        <div className="ws-label">图片描述词</div>
        <ClearableTextarea
          value={extDesc}
          onChange={(e) => setExtDesc(e.target.value)}
          onClear={() => setExtDesc("")}
          placeholder="补充画面细节，例如：果园场景、阳光洒落、丰收气息…"
        />
      </div>

          <div className="field">
            <div className="ws-label">上传参考图</div>
            <input
              ref={refInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => onPickFile(e, setRefImgUrl, refImgUrl, "参考图")}
            />
            <div
              className={`upload-box ${refImgUrl ? "filled ip-ref-filled" : ""}`}
              onClick={() => !refImgUrl && refInputRef.current?.click()}
              title={refImgUrl ? undefined : "上传参考图"}
            >
              {refImgUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="ip-ref-img" src={refImgUrl} alt="参考图预览" />
                  <div className="ip-ref-actions">
                    <button className="ip-ref-act" onClick={(e) => { e.stopPropagation(); refInputRef.current?.click(); }} title="更换参考图" aria-label="更换参考图">
                      <Icon name="upload" size={18} />
                    </button>
                    <button className="ip-ref-act" onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(refImgUrl); setRefImgUrl(""); }} title="删除参考图" aria-label="删除参考图">
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="ub-ico">
                    <Icon name="plus" size={26} />
                  </span>
                  <div className="ub-main">上传参考图</div>
                </>
              )}
            </div>
          </div>

      </div>
      <div className="ws-foot">
        <button className="btn btn-primary btn-block gen-btn" disabled={loading} onClick={handleExtGenerate}>
          立即生成 <span className="btn-credit">80算力</span>
        </button>
      </div>

      {/* 「仓库」选图弹窗：从我的作品/素材选一张作为 IP 图 */}
      {libOpen && <LibraryPickerModal onPick={pickFromLibrary} onClose={() => setLibOpen(false)} />}
    </>
  );
}
