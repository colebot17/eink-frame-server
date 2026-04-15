import { parentPort } from "worker_threads";

import DitherJS from "ditherjs/server.js";
const ditherjs = new DitherJS();

if (!parentPort) process.exit(0);

parentPort.on("message", ({ data, palette }) => {
    if (!parentPort) return;
    
    const buf = Buffer.from(data);

    const result = ditherjs.dither(buf, {
        step: 1,
        palette,
        algorithm: "atkinson"
    });

    parentPort.postMessage(result);
});