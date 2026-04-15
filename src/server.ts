import http from "http";
import fs from "fs";
const fsp = fs.promises;
import express from "express";
import type { Response } from "express";
import multer from "multer";
import cors from "cors";
import sharp, { type Color, type FitEnum } from "sharp";
import WebSocket, { WebSocketServer } from "ws";
import { Worker } from "worker_threads";
import path from "path";

import type { State, Mode, EPDColor, Item } from "./types/state.js";
import type { Message } from "./types/websocket.js";
import type { Img, RGBColor } from "./types/misc.js";

const COLOR_MAP : Record<EPDColor, number> = {
    "black": 0x0,
    "white": 0x1,
    "yellow": 0x2,
    "red": 0x3,
    "blue": 0x5,
    "green": 0x6
};

function isEPDColor(x: string): x is EPDColor {
    return x in COLOR_MAP;
}

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.use(express.static("client/dist"));

app.use("/image", express.static("processed"));
app.use("/preview", express.static("preview"));

app.use(express.json());

const DEFAULT_STATE : State = { mode: "blank", color: "white" };
let state : State;
let draftState : State;

let pendingDeletes = new Set<string>();

async function loadState() {
    try {
        const stateJson = await fsp.readFile("data/state.json", "utf8");
        state = JSON.parse(stateJson);
        draftState = JSON.parse(stateJson);
    } catch {
        state = structuredClone(DEFAULT_STATE);
        draftState = structuredClone(DEFAULT_STATE);
    }
}
await loadState();

async function saveState() {
    await fsp.mkdir("./data", { recursive: true });
    await fsp.writeFile("./data/state.json", JSON.stringify(state));
}

function broadcastState() {
    broadcast({ type: "state", state });
}

function broadcastDraft() {
    broadcast({ type: "draft_state", state: draftState });
}

async function broadcastAll() {
    const images: Img[] = await getSavedImages();
    broadcast({ type: "init", state, draft: draftState, images });
}


// finalize the draft and broadcast the new state
function commitDraft() {
    // require valid state
    switch (draftState.mode) {
        case "static":
            // make sure there is actually an image
            if (draftState.item == null) return false;
            break;
        case "blank":
            // all good
            break;
        default:
            // don't allow any other mode
            return false;
    }

    state = structuredClone(draftState);
    broadcastState();
    saveState();

    for (const id of pendingDeletes) {
        fsp.unlink("./processed/" + id + ".bin").catch(() => {});
        fsp.unlink("./preview/" + id + ".png").catch(() => {});
    }
    pendingDeletes.clear();

    return true;
}

function resetDraft() {
    draftState = structuredClone(state);
    pendingDeletes.clear();
    broadcastAll();
}

function setMode(m: Mode) {
    if (draftState.mode == m) return;
    switch (m) {
        case "static":
            draftState = {
                "mode": "static",
                "item": null
            };
            break;
        case "blank":
            draftState = {
                "mode": "blank",
                "color": "white"
            };
            break;
    }
    
    broadcastDraft();
}

function setBlankColor(color: EPDColor) {
    if (draftState.mode !== "blank") return;
    draftState.color = color;

    broadcastDraft();
}

function setStaticItem(item: Item, b: boolean = true) {
    if (draftState.mode !== "static") return;
    draftState.item = item;

    if (b) broadcastDraft();
}

// upload image
//                  tells multer to intercept the "photo" field and store it in "uploads/" (set above)
app.post("/upload", upload.single("photo"), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    await processImage(
        file.path,
        file.filename,
        await loadACT(req.body.color == "bw" ? "color_profiles/Black-White.act" : "color_profiles/6-color.act"),
        req.body.fit || "contain",
        req.body.background == "black" ? { r: 0, g: 0, b: 0, alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1}
    );

    // this filename doesn't have an extension because it's the raw one saved by multer
    setStaticItem({ type: "image", id: file.filename }, false);

    broadcastAll();

    res.sendStatus(200);
});

async function deleteImage(id: string) {
    // mark this image to be deleted
    pendingDeletes.add(id);

    // remove current image from the draft state
    if (draftState.mode === "static" && draftState.item?.type === "image" && draftState.item.id === id) {
        draftState.item = null;
        broadcastDraft();
    }

    broadcastAll();
}

async function serveItem(item: Item, res: Response) {
    switch (item.type) {
        case "image":
            const filePath = "processed/" + item.id + ".bin";
            const stat = await fsp.stat(filePath);

            res.setHeader("Content-Type", "application/octet-stream");

            const stream = fs.createReadStream(filePath).pipe(res);

            stream.on("error", () => {
                res.status(404).send("Image not found");
            });
    }
}

app.get("/currentImage", async (req, res) => {
    switch (state.mode) {
        case "static":
            if (state.item === null) return res.sendStatus(500);
            serveItem(state.item, res);
            break;
        case "blank":
            // send the raw clear color in a special byte
            const col = COLOR_MAP[state.color];
            const byte = 0xF0 | (col & 0x0F);
            res.status(200).send(Buffer.from([byte]));
            break;
    }
});

async function getSavedImages() {
    const files = await fsp.readdir("./processed/");

    const images: Img[] = [];
    
    for (const file of files) {
        const id = file.split(".")[0];
        if (!id) continue;

        if (pendingDeletes.has(id)) continue;
        
        images.push({ id });
    }

    return images;
}


const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const clients = new Set<WebSocket>();

async function initClient(ws: WebSocket) {
    if (ws.readyState !== WebSocket.OPEN) throw new Error("Socket not open");

    const images = await getSavedImages();
    sendToClient(ws, { type: "init", state, draft: draftState, images });
}

function sendToClient(client: WebSocket, message: Message) {
    client.send(JSON.stringify(message));
}

wss.on("connection", async ws => {
    console.log("Websocket Connected");
    clients.add(ws);


    // send the new client all the state information it needs
    initClient(ws).catch(reason => console.error(reason));


    ws.on("close", () => {
        console.log("Websocket Disconnected");
        clients.delete(ws);
    });

    ws.on("error", () => {
        ws.close();
    });

    ws.on("message", data => {
        const msg: Message = JSON.parse(data.toString());
        switch (msg.type) {
            case "update_begin":
                break;
            case "update_complete":
                break;
            case "set_mode":
                switch (msg.mode) {
                    case "static":
                    case "blank":
                        setMode(msg.mode);
                        break;
                }
                break;
            case "commit":
                commitDraft();
                break;
            case "reset_draft":
                resetDraft();
                break;
            case "set_color":
                if (isEPDColor(msg.color)) setBlankColor(msg.color);
                break;
            case "set_image":
                if (pendingDeletes.has(msg.id)) break;
                fsp.access("./processed/" + msg.id + ".bin").then(() => {
                    setStaticItem({ type: "image", id: msg.id });
                });
                break;
            case "delete_image":
                deleteImage(msg.id);
                break;
            default:
                console.log("Received unknown message from client:", msg);
        }
    });
});

app.get("/connections", (req, res) => {
    let numClients = 0;

    for (const ws of clients) {
        if (ws.readyState == WebSocket.OPEN) {
            numClients++;
        }
    }

    res.json({ count: numClients });
});

function broadcast(data: Message) {
    const message = JSON.stringify(data);

    for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    }
}

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

// loads an adobe color table and returns it as a list of color arrays
async function loadACT(path: fs.PathLike | fs.promises.FileHandle) {
    const buffer = await fsp.readFile(path);
    const palette: Array<RGBColor> = [];
    for (let i = 0; i < buffer.length; i += 3) {
        const r = buffer[i];
        const g = buffer[i + 1];
        const b = buffer[i + 2];

        if (r === undefined || g === undefined || b === undefined) break;

        let exists = false;
        for (let j = 0; j < palette.length; j++) {
            if (palette[j]?.[0] === r && palette[j]?.[1] === g && palette[j]?.[2] === b) {
                exists = true;
                break;
            }
        }

        if (!exists) palette.push([ r, g, b ]);
    }
    return palette;
}

async function processImage(inputPath: string, id: string, palette: RGBColor[], fit: keyof FitEnum, background: Color) {
    // make the image the right size and format it as a png buffer
    const { data, info } = await sharp(inputPath)
        .autoOrient()
        .resize(800, 480, { fit, background })
        .flatten({ background })
        .png()
        .toBuffer({ resolveWithObject: true });

    // send the png buffer to the dither worker
    const result: Buffer<any> = await new Promise((res, rej) => {
        const worker = new Worker(new URL("./ditherWorker.js", import.meta.url));
        
        worker.postMessage({ data, palette });
        worker.on("message", res);
        worker.on("error", rej);
        worker.on("exit", (code) => {
            if (code != 0) rej(new Error(`Worker stopped with code ${code}`));
        });
    });

    // write the output png directly to a preview png
    await fsp.writeFile("preview/" + id + ".png", result);

    // create the raw binary data

    // get a buffer of raw pixels
    const { data: resData, info: resInfo } = await sharp(result)
        .raw()
        .removeAlpha()
        .toBuffer({ resolveWithObject: true });

    const w = resInfo.width;
    const h = resInfo.height;

    const pixels = new Uint8Array(w * h / 2);
    let pixIndex = 0;

    // pack 2 pixels per byte (what the display module expects)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 2) {
            const i1 = (y * w + x) * 4;
            const i2 = (y * w + x + 1) * 4;

            const r1 = resData[i1]     || 0, r2 = resData[i2]     || 0
            const g1 = resData[i1 + 1] || 0, g2 = resData[i2 + 1] || 0
            const b1 = resData[i1 + 2] || 0, b2 = resData[i2 + 2] || 0

            const p1 = rgbToEPD(r1, g1, b1);
            const p2 = rgbToEPD(r2, g2, b2);

            pixels[pixIndex++] = ((p1 & 0x0F) << 4) | (p2 & 0x0F);
        }
    }

    // store in /processed
    await fsp.writeFile("./processed/" + id + ".bin", pixels);
}

// converts an rgb color to the nearest color supported by the 6-color e-paper display
// dithering should already be done at this point
function rgbToEPD(r: number, g: number, b: number) {
    if (r < 50 && g < 50 && b < 50) return 0x0; // black
    if (r > 200 && g > 200 && b > 200) return 0x1; // white

    if (r > 200 && g > 200 && b < 100) return 0x2; // yellow
    if (r > 200 && g < 100 && b < 100) return 0x3; // red
    if (r < 100 && g < 100 && b > 200) return 0x5; // blue
    if (r < 100 && g > 200 && b < 100) return 0x6; // green

    return 0x1; // default white
}