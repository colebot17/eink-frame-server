const { parentPort } = require("worker_threads");

const DitherJS = require("ditherjs/server");
const ditherjs = new DitherJS();

parentPort.on("message", ({ data, palette }) => {

    const buf = Buffer.from(data);

    const result = ditherjs.dither(buf, {
        step: 1,
        palette,
        algorithm: "atkinson"
    });

    parentPort.postMessage(result);
});