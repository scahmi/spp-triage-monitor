// ==UserScript==
// @name         SPP Triage Monitor
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      1.1.3
// @description  Monitor SPP triage and notify Telegram for Level 4 & 5
// @author       ETD HPG
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ================= SETTINGS ================= */
    const INTERVAL = 15000;
    const UPDATE_DELAY = 1200;

    let knownPatients = new Set();
    let running = true;

    /* ================= TELEGRAM ================= */
    const TELEGRAM_BOT_TOKEN = "8551613313:AAHDkj9A0V6iLFsoQ0yJzLBh1Cgac-7tTts";
    const TELEGRAM_CHAT_ID  = "-1003658002044";

    const beep = new Audio(
        "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

    /* ================= STATUS BAR ================= */
    let statusBox;

    function formatDate(d) {
        const p = n => n.toString().padStart(2, "0");
        return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)} ` +
               `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    function createStatusBox() {
        statusBox = document.createElement("div");
        Object.assign(statusBox.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            zIndex: "999999",
            padding: "10px 14px",
            background: "#fff",
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: "8px",
            fontSize: "13px",
            boxShadow: "0 2px 6px rgba(0,0,0,.15)",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial"
        });
        document.body.appendChild(statusBox);
        updateStatus("-", true);
    }

    function updateStatus(lastUpdate, ok) {
        statusBox.innerHTML = `
            <div>
                <strong>Monitoring Status:</strong>
                <span style="color:${ok ? "#2e7d32" : "#999"};font-weight:600">
                    ${ok ? "Monitoring" : "Not monitoring"}
                </span>
            </div>
            <div><strong>Last Update:</strong> ${lastUpdate}</div>
        `;
    }

    /* ================= TELEGRAM SEND ================= */
    function sendTelegram(msg) {
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: msg
            })
        });
    }

    /* ================= ID MASKING ================= */
    function maskID(idText) {
        const m = idText.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (!m) return idText;

        const value = m[1].trim();
        const type = m[2].trim();

        // NRIC: 12 digits
        if (/^\d{12}$/.test(value)) {
            return `${value.slice(0,8)}XXXX (${type})`;
        }

        // Passport
        if (/passport/i.test(type) && value.length >= 6) {
            const keep = Math.ceil(value.length / 2);
            return `${value.slice(0, keep)}${"X".repeat(value.length - keep)} (${type})`;
        }

        return idText;
    }

    /* ================= EXTRACTION ================= */
    function extractPatients() {
        const rows = document.querySelectorAll("table tbody tr");
        const patients = [];

        rows.forEach(row => {
            // ---- TRIAGE LEVEL (SPAN SCAN) ----
            let level = null;
            row.querySelectorAll("span").forEach(s => {
                const m = s.textContent.match(/LEVEL\s*(4|5)\b/i);
                if (m) level = m[1];
            });
            if (!level) return;

            // ---- NAME ----
            const nameEl = row.querySelector(".v-button-caption");
            const name = nameEl ? nameEl.textContent.trim() : "UNKNOWN";

            // ---- ID ----
            let id = "UNKNOWN";
            row.querySelectorAll(".v-label").forEach(lbl => {
                const m = lbl.textContent.match(/\|\s*([^|]+?\([^)]+\))/);
                if (m) id = maskID(m[1].trim());
            });

            const signature = `${name}|${id}|${level}`;
            patients.push({
                name,
                id,
                triage: `Level ${level}`,
                signature
            });
        });

        return patients;
    }

    /* ================= RESET ================= */
    function clickReset() {
        const btn = document.getElementById("Reset");
        if (btn) btn.click();
    }

    function waitForReset(cb) {
        const t = setInterval(() => {
            if (document.getElementById("Reset")) {
                clearInterval(t);
                cb();
            }
        }, 500);
    }

    /* ================= MAIN LOOP ================= */
    function loop() {
        if (!running) return;

        clickReset();

        setTimeout(() => {
            const found = extractPatients();
            const now = formatDate(new Date());

            found.forEach(p => {
                if (!knownPatients.has(p.signature)) {
                    if (knownPatients.size > 0) {
                        beep.play().catch(()=>{});
                        sendTelegram(
                            `⚠️ SPP TRIAGE ALERT ⚠️\n` +
                            `New patient registered\n` +
                            `Time: ${new Date().toLocaleString()}\n` +
                            `Name: ${p.name}\n` +
                            `ID: ${p.id}\n` +
                            `Triage Category : ${p.triage}`
                        );
                    }
                    knownPatients.add(p.signature);
                }
            });

            updateStatus(now, true);
        }, UPDATE_DELAY);

        setTimeout(loop, INTERVAL);
    }

    /* ================= START ================= */
    waitForReset(() => {
        createStatusBox();
        loop();
    });

})();
