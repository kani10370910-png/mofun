/**
 * 视频模块「参考灵感」（从编辑器内联数据抽出，供模版库复用）
 */

export const onelineInspires: {
  cat: string;
  scene: string;
  emoji: string;
  prompt: string;
  poster: string;
  videoUrl: string;
  ratio: string;
  dur: string;
  style: string;
}[] = [
  {
    cat: "农业宣传",
    scene: "农产品推广",
    emoji: "",
    prompt: "萧山杨梅初夏头茬，果农指尖采摘紫红果实，杨梅林实景，产地直发宣传短视频",
    poster: "/poster-gen/ins-baicha.jpg",
    videoUrl: "/demo-videos/hist-baicha.mp4",
    ratio: "16:9",
    dur: "6秒",
    style: "写实",
  },
  {
    cat: "文化旅游",
    scene: "景区宣传",
    emoji: "",
    prompt: "安吉余村绿水青山，竹海骑行与古村漫步，适合亲子游的生态文旅目的地",
    poster: "/poster-gen/ins-yucun.jpg",
    videoUrl: "/demo-videos/hist-yucun.mp4",
    ratio: "9:16",
    dur: "10秒",
    style: "航拍大片",
  },
];

export const avatarInspires: {
  presetId: string;
  title: string;
  script: string;
  cover?: string;
}[] = [
  {
    presetId: "av1",
    title: "景区导游 · 欢迎词",
    script:
      "各位游客朋友大家好！欢迎来到我们的景区，这里山清水秀、四季如画。今天就由我带大家一起领略这片土地的独特魅力，走进自然、感受人文。",
    cover: "/avatars/av1.jpg",
  },
];
