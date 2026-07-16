/* 音色库：制作大片 ② 角色卡「音色选择」。tts=火山「语音合成大模型」真实 voice_type(id)。
   分类维度参考有戏AI；只收录火山真实存在的音色（点击试听走 /api/tts → 火山合成）。
   注：部分音色需在火山控制台单独开通，未开通的合成会提示"该音色未开通"。 */

export interface Voice {
  id: string;
  name: string;
  scene: string;
  age: string;
  gender: string;
  multiEmotion?: boolean;
  tts: string; // 火山 voice_type
}

export const VOICE_SCENES = [
  "全部场景",
  "影视解说",
  "搞笑视频",
  "角色扮演",
  "通用场景",
  "多情感",
  "方言口音",
  "视频配音",
  "社交陪伴",
] as const;
export const VOICE_AGES = ["全部年龄", "未设置", "儿童", "少年/少女", "青年", "中年", "老年"] as const;
export const VOICE_GENDERS = ["全部性别", "男声", "女声", "中性"] as const;
export const VOICE_EMOTIONS = ["中性", "开心", "伤心", "生气", "惊讶", "平静"] as const;

const F = "女声", M = "男声", N = "中性";
type G = typeof F | typeof M | typeof N;
let _seq = 0;
function v(name: string, scene: string, age: string, gender: G, tts: string, multiEmotion?: boolean): Voice {
  _seq += 1;
  return { id: `v${_seq}`, name, scene, age, gender, tts, multiEmotion };
}

export const VOICES: Voice[] = [
  // —— 角色扮演 · 多情感 ——
  v("甜心小美", "角色扮演", "青年", F, "zh_female_tianxinxiaomei_emo_v2_mars_bigtts", true),
  v("高冷御姐", "角色扮演", "青年", F, "zh_female_gaolengyujie_emo_v2_mars_bigtts", true),
  v("傲娇霸总", "角色扮演", "青年", M, "zh_male_aojiaobazong_emo_v2_mars_bigtts", true),
  v("儒雅男友", "角色扮演", "青年", M, "zh_male_ruyayichen_emo_v2_mars_bigtts", true),
  v("俊朗男友", "角色扮演", "青年", M, "zh_male_junlangnanyou_emo_v2_mars_bigtts", true),
  // —— 角色扮演 ——
  v("魅力女友", "角色扮演", "青年", F, "zh_female_meilinvyou_moon_bigtts"),
  v("柔美女友", "角色扮演", "青年", F, "zh_female_sajiaonvyou_moon_bigtts"),
  v("温柔淑女", "角色扮演", "青年", F, "zh_female_wenroushunv_mars_bigtts"),
  v("娇喘女声", "角色扮演", "青年", F, "zh_female_jiaochuan_mars_bigtts"),
  v("少年梓辛", "角色扮演", "少年/少女", M, "zh_male_shaonianzixin_moon_bigtts"),
  v("渊博小叔", "角色扮演", "中年", M, "zh_male_yuanboxiaoshu_moon_bigtts"),
  v("儒雅青年", "角色扮演", "青年", M, "zh_male_ruyaqingnian_mars_bigtts"),
  v("霸气青叔", "角色扮演", "中年", M, "zh_male_baqiqingshu_mars_bigtts"),
  v("开朗弟弟", "角色扮演", "少年/少女", M, "zh_male_livelybro_mars_bigtts"),
  v("奶气萌娃", "角色扮演", "儿童", M, "zh_male_naiqimengwa_mars_bigtts"),
  v("婆婆", "角色扮演", "老年", F, "zh_female_popo_mars_bigtts"),
  // —— 方言口音 ——
  v("广州德哥", "方言口音", "中年", M, "zh_male_guangzhoudege_emo_mars_bigtts", true),
  v("京腔侃爷", "方言口音", "中年", M, "zh_male_jingqiangkanye_emo_mars_bigtts", true),
  v("邻居阿姨", "方言口音", "中年", F, "zh_female_linjuayi_emo_v2_mars_bigtts", true),
  v("双节棍小哥", "方言口音", "青年", M, "zh_male_zhoujielun_emo_v2_mars_bigtts", true),
  v("妹坨洁儿", "方言口音", "青年", F, "zh_female_meituojieer_moon_bigtts"),
  // —— 影视解说 ——
  v("磁性解说男声", "影视解说", "中年", M, "zh_male_jieshuonansheng_mars_bigtts"),
  v("悬疑解说", "影视解说", "中年", M, "zh_male_changtianyi_mars_bigtts"),
  // —— 视频配音 ——
  v("广告解说", "视频配音", "中年", M, "zh_male_chunhui_mars_bigtts"),
  // —— 通用场景 ——
  v("爽快思思", "通用场景", "青年", F, "zh_female_shuangkuaisisi_moon_bigtts"),
  // —— 社交陪伴 ——
  v("撒娇学妹", "社交陪伴", "少年/少女", F, "zh_female_yuanqinvyou_moon_bigtts"),
];

export function findVoice(id?: string): Voice | undefined {
  return id ? VOICES.find((x) => x.id === id) : undefined;
}
