const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menampilkan file frontend
app.use(express.static(path.join(__dirname, "public")));

// Halaman utama
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API Chatbot
app.post("/api/chat", async (req, res) => {
    try {
        const messages = req.body.messages;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: "Messages harus berupa array"
            });
        }

        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({
                error: "OPENROUTER_API_KEY belum dikonfigurasi"
            });
        }

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
                },
                body: JSON.stringify({
                    model: "inclusionai/ling-3.2-flash:free",
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 1000,
                    stream: true
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.text();

            console.error("OpenRouter Error:", errorData);

            return res.status(response.status).json({
                error: errorData
            });
        }

        // Header streaming
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, {
                stream: true
            });

            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (!trimmedLine.startsWith("data:")) continue;

                const data = trimmedLine.slice(5).trim();

                if (data === "[DONE]") continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;

                    if (content) {
                        res.write(
                            `data: ${JSON.stringify(content)}\n\n`
                        );
                    }
                } catch (error) {
                    console.error("Gagal parsing streaming data:", error);
                }
            }
        }

        res.write("data: [DONE]\n\n");
        res.end();

    } catch (error) {
        console.error("Server Error:", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Terjadi kesalahan pada server"
            });
        } else {
            res.end();
        }
    }
});

// Export untuk Vercel
module.exports = app;

// Jalankan server secara lokal
if (require.main === module) {
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
}
