const http = require("http");
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs").promises;
const sharp = require("sharp");
const bmp = require("sharp-bmp");
const WebSocket = require("ws");

const { Worker } = require("worker_threads");
const path = require("path");

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));

app.use("/image", express.static("processed"));

app.use("/client", express.static("client"));

app.use(express.json());

let currentImage = null;

// load the current image from file
async function loadCurrentImage() {
    try {
        currentImage = await fs.readFile("data/currentImage.txt", "utf8");
    } catch {
        console.log("Current image not loaded from file");
    }
}
loadCurrentImage();

// upload.single("photo") tells multer to intercept the "photo" field and store it in "uploads/" (set above)
app.post("/upload", upload.single("photo"), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    await processImage(file.path, "processed/" + file.filename + ".bmp", await loadACT("color_profiles/N-color.act"), req.body.fit || "contain");

    setCurrentImage(file.filename + ".bmp");

    res.json({ message: "Upload Successful", filename: currentImage });
});

app.get("/current", (req, res) => {
    res.json({ filename: currentImage });
});

app.get("/all", async (req, res) => {
    const files = await getImages();
    res.json({ files });
});

app.post("/delete", async (req, res) => {
    try {
        const images = await getImages(); // valid filenames

        if (!images.includes(req.body.filename)) {
            return res.status(400).json({ error: "Invalid filename" });
        }

        await fs.unlink("processed/" + req.body.filename);
        
        if (currentImage === req.body.filename) {
            const remaining = await getImages();
            setCurrentImage(remaining[Math.floor(Math.random() * remaining.length)]);
        }
    } catch (err) {
        console.error(err);
        return res.sendStatus(500);
    }
    return res.json({ filename: currentImage });
});

app.post("/select", async (req, res) => {
    await setCurrentImage(req.body.filename);
    res.json({ filename: currentImage });
});

app.get("/clear", async (req, res) => {
    await setCurrentImage("", false);
    res.json({ filename: "" });
    broadcast({ type: "clear" });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on("connection", ws => {
    console.log("Websocket Connected");
    clients.add(ws);

    ws.on("close", () => {
        console.log("Websocket Disconnected");
        clients.delete(ws);
    });

    ws.on("error", () => {
        ws.close();
    });
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
    return await fs.readdir("processed/");
}

async function setCurrentImage(filename, b = true) {
    if (b) broadcast({ type: "update", filename });
    currentImage = filename;
    await fs.writeFile("data/currentImage.txt", filename);
}

async function loadACT(path) {
    const buffer = await fs.readFile(path);
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

async function processImage(inputPath, outputPath, palette, fit) {
    const { data, info } = await sharp(inputPath)
        .rotate()
        .resize(800, 480, { fit, background: { r: 255, g: 255, b: 255, alpha: 1} })
        .ensureAlpha()
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

    const r = sharp(result).removeAlpha();
    await bmp.sharpToBmp(r, outputPath);
}