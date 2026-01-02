// ==UserScript==
// @name         SPP Patient Monitor (Green Zone Only)
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      3.2.3
// @description  Notify Telegram + sound when new GREEN ZONE patient appears
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ========= WAIT FOR CORRECT SPA VIEW ========= */
    function waitForCorrectView(cb) {
        const t = setInterval(() => {
            if (location.hash === "#!TriageAssessmentView") {
                clearInterval(t);
                cb();
            }
        }, 300);
    }

    waitForCorrectView(main);

    function main() {

        /* ================= CONFIG ================= */
        const INTERVAL = 15000;
        const UPDATE_DELAY = 1200;

        const TELEGRAM_BOT_TOKEN = "8551613313:AAHDkj9A0V6iLFsoQ0yJzLBh1Cgac-7tTts";
        const TELEGRAM_CHAT_ID = "-1003658002044";

        /* ================= STATE ================= */
        let knownPatients = new Set();

        const beep = new Audio(
            "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
        );

        /* ================= UNLOCK SOUND ================= */
        document.addEventListener("click", () => {
            beep.play().catch(() => {});
        }, { once: true });

        /* ================= STATUS BAR ================= */
        let statusBox;

        function nowStr() {
            const d = new Date();

            const day = String(d.getDate()).padStart(2, "0");
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const year = d.getFullYear();

            let hours = d.getHours();
            const minutes = String(d.getMinutes()).padStart(2, "0");
            const seconds = String(d.getSeconds()).padStart(2, "0");

            const ampm = hours >= 12 ? "PM" : "AM";
            hours = hours % 12 || 12;

            return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
        }

        function createStatusBox() {
            statusBox = document.createElement("div");
            Object.assign(statusBox.style, {
                position: "fixed",
                bottom: "20px",
                left: "20px",
                zIndex: 999999,
                padding: "10px 14px",
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
            });

            document.body.appendChild(statusBox);
            updateStatus("-");
        }

        function updateStatus(time) {
            statusBox.innerHTML = `
                <div>
                    <strong>Monitoring Status:</strong>
                    <span style="color:#2e7d32;font-weight:600">Monitoring</span>
                </div>
                <div><strong>Last Update:</strong> ${time}</div>
            `;
        }

        /* ================= TELEGRAM (HTML MODE) ================= */
        function sendTelegram(msg) {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: msg,
                    parse_mode: "HTML"
                })
            });
        }

        /* ================= ID MASKING ================= */
        function maskID(raw) {
            const m = raw.match(/^(.+?)\s*\(([^)]+)\)$/);
            if (!m) return raw;

            const value = m[1].trim();
            const type = m[2].trim();

            if (/^\d{12}$/.test(value)) {
                return `${value.slice(0, 8)}XXXX (${type})`;
            }

            if (/passport/i.test(type) && value.length >= 6) {
                const keep = Math.ceil(value.length / 2);
                return `${value.slice(0, keep)}${"X".repeat(value.length - keep)} (${type})`;
            }

            return raw;
        }

        /* ================= GREEN ZONE DETECTION ================= */
        function isGreenZone(row) {
            return !!row.querySelector(".v-table-cell-content-etdGreen");
        }

        /* ================= DATA EXTRACTION ================= */
        function extractPatients() {
            const rows = document.querySelectorAll("table tbody tr");
            const patients = [];

            rows.forEach(row => {
                if (!isGreenZone(row)) return;

                const nameEl = row.querySelector(".v-button-caption");
                const labelEl = row.querySelector(".v-label");

                if (!nameEl || !labelEl) return;

                const name = nameEl.innerText.trim();
                const idMatch = labelEl.innerText.match(/\|\s*([^|]+?\([^)]+\))/);
                const id = idMatch ? maskID(idMatch[1].trim()) : "UNKNOWN";

                patients.push({
                    name,
                    id,
                    signature: `${name}|${id}`
                });
            });

            return patients;
        }

        /* ================= RESET ================= */
        function clickReset() {
            const btn = document.getElementById("Reset");
            if (btn) btn.click();
        }

        /* ================= MAIN LOOP ================= */
        function loop() {
            clickReset();

            setTimeout(() => {
                const patients = extractPatients();
                const now = nowStr();

                patients.forEach(p => {
                    if (knownPatients.has(p.signature)) return;

                    beep.play().catch(() => {});

                    sendTelegram(
                        `<b>🟩 GREEN ZONE ALERT 🟩</b>\n` +
                        `New patient registered\n` +
                        `Time: ${now}\n` +
                        `Name: ${p.name}\n` +
                        `ID: ${p.id}`
                    );

                    knownPatients.add(p.signature);
                });

                updateStatus(now);
            }, UPDATE_DELAY);

            setTimeout(loop, INTERVAL);
        }

        /* ================= START ================= */
        const wait = setInterval(() => {
            if (document.getElementById("Reset")) {
                clearInterval(wait);
                createStatusBox();
                loop();
            }
        }, 500);
    }
})();
