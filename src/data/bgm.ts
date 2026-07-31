/* 内置背景音乐曲库：制作大片 ⑤ 视频预览「背景音乐」用。
   音频文件放在 public/bgm/{id}.mp3（版权自备）。缺失文件则该曲目播放为静音，可改用本地上传。 */

export interface BgmPreset {
  id: string;
  name: string;
  mood: string; // 情绪/风格标签
  tone: string; // 封面色
}

export const BGM_PRESETS: BgmPreset[] = [
  { id: "nomad", name: "游牧乐章", mood: "旷野", tone: "#188772" },
  { id: "nightcity", name: "夜色都市", mood: "都市", tone: "#126b5b" },
  { id: "swing", name: "摇摆商路", mood: "轻快", tone: "#2bb89c" },
  { id: "cyber", name: "未来赛博", mood: "电子", tone: "#0f766e" },
  { id: "pace", name: "踏节而行", mood: "节奏", tone: "#1a9a82" },
  { id: "hunter", name: "数字猎人", mood: "动感", tone: "#147a68" },
  { id: "starry", name: "孤独星空下", mood: "空灵", tone: "#3a8f7e" },
  { id: "dream", name: "神秘梦境", mood: "梦幻", tone: "#4aa894" },
  { id: "caravan", name: "商队漫游记", mood: "叙事", tone: "#0d9488" },
];

export const bgmUrl = (id: string) => `/bgm/${id}.mp3`;
