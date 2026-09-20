/** 用户端功能 → 运营智能体编码。生成接口按编码读取工作流绑定的模型与节点。 */

export const AGENT = {
  videoFrameExtract: "Common-VideoFrameExtract",
  flashKb: "FlashVideo-Knowledge",
  flashExtend: "FlashVideo-AIExtend",
  flashT2v: "FlashVideo-GenerateVideo",
  flashI2v: "FlashVideo-GenerateVideoI2V",
  flashFlf: "FlashVideo-GenerateVideoFLF",
  ipThreeView: "IP-GenerateThreeView",
  ipMerch: "IP-GenerateMerchandise",
  ipStory: "IP-Agent-Story",
  ipExtend: "IP-Agent-extend",
  ipDesign: "IP-Agent-Design",
  ipPropose: "IP-Association",
  ipVi: "IP-VI-Extend",
  videoMerge: "Video-VideoMerge",
  videoVoice: "Video-GenerateVoice",
  videoShotImage: "Video-GenerateShotlistImage",
  videoGen: "Video-GenerateVideo",
  videoEditAsset: "Video-EditAssetsImage",
  videoAssetImage: "Video-GenerateAssetsImage",
  videoAssetExpand: "Video-GenerateAssets",
  videoShotlist: "Video-GenerateShotlist",
  videoExtractAssets: "Video-AssetExtraction",
  videoScript: "Video-GenerateScript",
  videoVoiceMatch: "Video-VoiceMatch",
  videoSpeakers: "Video-AssignSpeakers",
  videoSafeRewrite: "Video-SafetyRewrite",
  activityI2t: "Activity-Image2Text",
  activityT2i: "Activity-Text2Image",
  activityI2i: "Activity-Image2Image",
  activityAssociate: "Activity-Association",
  enhance: "to_image_edit",
  cutout: "to_smart_cutout",
  vector: "to_vectorize",
  vectorBasic: "to_vectorize_basic",
  vectorPro: "to_vectorize_pro",
  erase: "to_image_erase",
  expand: "to_image_expand",
  repair: "to_image_repair",
  logoEnhance: "logo_image_enhance",
  font: "Font-Text2Image",
  logo: "Logo-Text2Image",
} as const;

export type AgentCode = (typeof AGENT)[keyof typeof AGENT];

export const GENERATE_SCENE_AGENT: Record<string, string> = {
  "studio-script": AGENT.videoScript,
  "studio-script-pro": AGENT.videoScript,
  "studio-assets": AGENT.videoExtractAssets,
  "studio-asset-desc": AGENT.videoAssetExpand,
  "studio-shots": AGENT.videoShotlist,
  "studio-safe-rewrite": AGENT.videoSafeRewrite,
  "studio-speakers": AGENT.videoSpeakers,
  "studio-voice-match": AGENT.videoVoiceMatch,
  "ip-propose": AGENT.ipPropose,
  "ip-story": AGENT.ipStory,
  "ip-story-desc": AGENT.ipStory,
  "t2i-associate": AGENT.activityAssociate,
  "t2i-event": AGENT.activityAssociate,
};

export function imageSceneAgent(scene?: string, hasImage?: boolean): string | undefined {
  if (!scene) return undefined;
  if (scene === "logo") return AGENT.logo;
  if (scene === "font") return AGENT.font;
  if (scene === "event") return hasImage ? AGENT.activityI2i : AGENT.activityT2i;
  if (scene === "ip") return hasImage ? AGENT.ipExtend : AGENT.ipDesign;
  if (scene === "ip-three-view") return AGENT.ipThreeView;
  if (scene === "ip-merch") return AGENT.ipMerch;
  if (scene === "studio-shot") return AGENT.videoShotImage;
  if (scene === "studio-asset") return hasImage ? AGENT.videoEditAsset : AGENT.videoAssetImage;
  return undefined;
}

export const IMAGE_TOOL_AGENT: Record<string, string> = {
  enhance: AGENT.enhance,
  erase: AGENT.erase,
  expand: AGENT.expand,
  repair: AGENT.repair,
  matting: AGENT.cutout,
  vector: AGENT.vector,
  vectorBasic: AGENT.vectorBasic,
  vectorPro: AGENT.vectorPro,
};
