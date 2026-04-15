declare module "ditherjs/server.js" {
    interface DitherOptions {
        step: number;
        palette: [[number, number, number]];
        algorithm: "ordered" | "diffusion" | "atkinson";
    }

    class DitherJS {
        constructor(options?: DitherOptions);
        dither(buf: Buffer<any>, options?: DitherOptions) : Buffer<any>;
    }

    export default DitherJS;
}