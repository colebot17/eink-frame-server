const http = require("http");
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const fsp = fs.promises;
const sharp = require("sharp");
const bmp = require("sharp-bmp");
const WebSocket = require("ws");

const { Worker } = require("worker_threads");
const path = require("path");

const COLORS = {
    "black": 0x0,
    "white": 0x1,
    "yellow": 0x2,
    "red": 0x3,
    "blue": 0x5,
    "green": 0x6
};

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.use("/image", express.static("processed"));
app.use("/preview", express.static("preview"));

app.use(express.json());

let currentImage = null;

// load the current image from file
async function loadCurrentImage() {
    try {
        currentImage = await fsp.readFile("data/currentImage.txt", "utf8");
    } catch {
        console.log("Current image not loaded from file");
    }
}
loadCurrentImage();

let currentColor = null;
async function loadCurrentColor() {
    try {
        currentColor = COLORS[await fsp.readFile("data/currentColor.txt", "utf8")];
    } catch {
        console.log("Current color was not loaded from file");
    }
}
loadCurrentColor();

let mode = "static";
async function loadMode() {
    try {
        mode = await fsp.readFile("data/mode.txt", "utf8");
    } catch {
        console.log("Mode not loaded from file");
    }
}
loadMode();

async function setMode(m) {
    mode = m;
    
    broadcast({ "type": "modeChange" });

    const dirPath = path.join(__dirname, "data");
    await fsp.mkdir(dirPath, { recursive: true });
    const filePath = path.join(dirPath, "mode.txt");
    await fsp.writeFile(filePath, mode);
}

app.post("/setMode", async (req, res) => {
    setMode(req.body.mode);
    return res.status(200);
});

async function setCurrentColor(colorName) {
    currentColor = COLORS[colorName];

    if (mode == "blank") broadcast({ "type": "update" });

    const dirPath = path.join(__dirname, "data");
    await fsp.mkdir(dirPath, { recursive: true });
    const filePath = path.join(dirPath, "currentColor.txt");
    await fsp.writeFile(filePath, colorName);
}

app.post("/setColor", async (req, res) => {
    setCurrentColor(req.body.color);
    return res.status(200);
});

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

    setCurrentImage(file.filename);

    res.json({ message: "Upload Successful", id: currentImage, preview: "preview/" + currentImage + ".png" });
});

app.get("/current", (req, res) => {
    if (mode == "blank") {
        if (currentColor != null) {
            res.json({ mode: "blank", color: currentColor });
        } else {
            res.json({ mode: "blank", color: 0x1 /* white */ });
        }
    } else {
        if (currentImage) {
            res.json({
                id: currentImage,
                preview: "preview/" + currentImage + ".png"
            });
        } else {
            res.json({ id: "", preview: "" });
        }
    }
});

app.get("/currentImage", async (req, res) => {
    if (mode == "blank") {
        // send the raw clear color in a special byte
        const col = currentColor != null ? currentColor : 0x1;
        const byte = 0xF0 | (col & 0x0F);
        res.status(200).send(Buffer.from([byte]));
    } else {
        const filePath = "processed/" + currentImage + ".bin";

        const stream = fs.createReadStream(filePath);

        stream.on("open", async () => {
            res.setHeader("Content-Type", "application/octet-stream");
            const stat = await fsp.stat(filePath);
            res.setHeader("Content-Length", stat.size);
            stream.pipe(res);
        });

        stream.on("error", () => {
            res.status(404).send("Image not found");
        });
    }
});

app.get("/all", async (req, res) => {
    const files = await getImages();
    const toReturn = files.map(filename => ({
        id: filename.split(".")[0],
        preview: "/preview/" + filename.split(".")[0] + ".png"
    }));
    res.json(toReturn);
});

app.post("/delete", async (req, res) => {
    try {
        await fsp.unlink("processed/" + req.body.id + ".bin");
        await fsp.unlink("preview/" + req.body.id + ".png");
        
        if (currentImage === req.body.id) {
            const remaining = await getImages();
            if (!remaining.length) {
                setCurrentImage(null);
            } else {
                setCurrentImage(remaining[Math.floor(Math.random() * remaining.length)].split(".")[0]);
            }
        }
    } catch (err) {
        console.error(err);
        return res.sendStatus(500);
    }
    return res.json({ id: currentImage, preview: "preview/" + currentImage + ".png" });
});

app.post("/select", async (req, res) => {
    await setCurrentImage(req.body.id);
    res.json({ id: currentImage, preview: "preview/" + currentImage + ".png" });
});


const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on("connection", ws => {
    console.log("Websocket Connected");
    clients.add(ws);

    ws.updating = false;

    ws.on("close", () => {
        console.log("Websocket Disconnected");
        clients.delete(ws);
    });

    ws.on("error", () => {
        ws.close();
    });

    ws.on("message", data => {
        const msg = JSON.parse(data.toString());
        switch (msg.type) {
            case "updateBegin":
                ws.updating = true;
                ws.updateTimeout = setTimeout(() => {
                    ws.updating = false;
                    broadcastUpdateCompleteIfAllComplete();
                }, 90000);
                break;
            case "updateComplete":
                clearTimeout(ws.updateTimeout);
                if (ws.updating) {
                    ws.updating = false;
                    broadcastUpdateCompleteIfAllComplete();
                }
                break;
            default:
                console.log("Received unknown message from client:", msg);
        }
    });
});

function broadcastUpdateCompleteIfAllComplete() {
    let allComplete = true;
    for (const s of clients) {
        if (s.updating) {
            allComplete = false;
            break;
        }
    }
    if (allComplete) broadcast({ "type": "updateComplete" });
}

app.get("/connections", (req, res) => {
    let numClients = 0;

    for (const ws of clients) {
        if (ws.readyState == WebSocket.OPEN) {
            numClients++;
        }
    }

    res.json({ count: numClients });
});

function broadcast(data) {
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

async function getImages() {
    return await fsp.readdir("processed/");
}

async function setCurrentImage(id) {
    if (mode == "static") {
        if (id) {
            broadcast({ type: "update", id, preview: "/preview/" + id + ".png" });
        } else {
            broadcast({ type: "clear" });
        }
    }
    currentImage = id;

    const dirPath = path.join(__dirname, "data");
    await fsp.mkdir(dirPath, { recursive: true });
    const filePath = path.join(dirPath, "currentImage.txt");
    await fsp.writeFile(filePath, id);
}

async function loadACT(path) {
    const buffer = await fsp.readFile(path);
    const palette = [];
    for (let i = 0; i < 256; i++) {
        const r = buffer[i * 3];
        const g = buffer[i * 3 + 1];
        const b = buffer[i * 3 + 2];

        let exists = false;
        for (let j = 0; j < palette.length; j++) {
            if (palette[j][0] === r && palette[j][1] === g && palette[j][2] === b) {
                exists = true;
                break;
            }
        }

        if (!exists) palette.push([ r, g, b ]);
    }
    return palette;
}

async function processImage(inputPath, filename, palette, fit, background) {
    const { data, info } = await sharp(inputPath)
        .rotate()
        .resize(800, 480, { fit, background })
        .flatten({ background })
        .png()
        .toBuffer({ resolveWithObject: true });

    const result = await new Promise((res, rej) => {
        const worker = new Worker(path.resolve(__dirname, "ditherWorker.js"));
        
        worker.postMessage({ data, palette });
        worker.on("message", res);
        worker.on("error", rej);
        worker.on("exit", (code) => {
            if (code != 0) rej(new Error(`Worker stopped with code ${code}`));
        });
    });

    await fsp.writeFile("preview/" + filename + ".png", result);

    const { data: resData, info: resInfo } = await sharp(result)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

    const w = resInfo.width;
    const h = resInfo.height;

    const pixels = new Uint8Array(w * h / 2);
    let pixIndex = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x += 2) {
            const i1 = (y * w + x) * 4;
            const i2 = (y * w + x + 1) * 4;

            const p1 = rgbToEPD(resData[i1], resData[i1+1], resData[i1+2]);
            const p2 = rgbToEPD(resData[i2], resData[i2+1], resData[i2+2]);

            pixels[pixIndex++] = ((p1 & 0x0F) << 4) | (p2 & 0x0F);
        }
    }

    await fsp.writeFile("processed/" + filename + ".bin", pixels);
}

function rgbToEPD(r, g, b) {
    // Simple nearest-color mapping (dithering is already done)

    if (r < 50 && g < 50 && b < 50) return 0x0; // black
    if (r > 200 && g > 200 && b > 200) return 0x1; // white

    if (r > 200 && g > 200 && b < 100) return 0x2; // yellow
    if (r > 200 && g < 100 && b < 100) return 0x3; // red
    if (r < 100 && g < 100 && b > 200) return 0x5; // blue
    if (r < 100 && g > 200 && b < 100) return 0x6; // green

    return 0x1; // default white
}