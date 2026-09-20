/** 各功能是否调用 LoRA / 知识库。不调用则不展示相关开关、角标与配置字段。 */
export const FEATURE_CALLS = {
  font: { lora: false, kb: false },
  logo: { lora: true, kb: false },
  ipCreate: { lora: true, kb: true },
  ipExtend: { lora: true, kb: false },
  eventT2i: { lora: true, kb: true },
  eventI2i: { lora: false, kb: false },
  onelineT2v: { lora: false, kb: true },
  onelineI2v: { lora: false, kb: false },
  studio: { lora: false, kb: true },
} as const;

export type FeatureCallKey = keyof typeof FEATURE_CALLS;

export function callsLora(feature: FeatureCallKey) {
  return FEATURE_CALLS[feature].lora;
}

export function callsKb(feature: FeatureCallKey) {
  return FEATURE_CALLS[feature].kb;
}
