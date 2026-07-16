/* 内置背景音乐曲库：制作大片 ⑤ 视频预览「背景音乐」用。
   音频文件放在 public/bgm/{id}.mp3（版权自备）。缺失文件则该曲目播放为静音，可改用本地上传。 */

export interface BgmPreset {
  id: string;
  name: string;
  mood: string; // 情绪/风格标签
}

export const BGM_PRESETS: BgmPreset[] = [
  { id: "gentle", name: "舒缓轻音乐", mood: "治愈" },
  { id: "epic", name: "大气磅礴", mood: "宏大" },
  { id: "happy", name: "欢快明亮", mood: "活泼" },
  { id: "warm", name: "温情钢琴", mood: "温暖" },
  { id: "suspense", name: "悬疑紧张", mood: "悬疑" },
  { id: "guofeng", name: "国风古韵", mood: "国风" },
];

export const bgmUrl = (id: string) => `/bgm/${id}.mp3`;
