// onnxruntime-web 的 package.json exports 未暴露 types 条件（bundler 解析取不到完整类型）。
// 这里只声明本项目 videoMatte.ts 实际用到的成员，给出精确类型（避免 any）。
declare module "onnxruntime-web" {
  export interface Tensor {
    readonly data: Float32Array;
    readonly dims: readonly number[];
  }
  export const Tensor: {
    new (type: "float32", data: Float32Array, dims: number[]): Tensor;
  };
  export interface InferenceSession {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }
  export const InferenceSession: {
    create(path: string, options?: { executionProviders?: string[] }): Promise<InferenceSession>;
  };
  export const env: { wasm: { wasmPaths: string; numThreads: number } };
}
