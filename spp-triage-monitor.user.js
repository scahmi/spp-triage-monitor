// ==UserScript==
// @name         SPP Patient Monitor (Green Zone + Arrival Time)
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      3.3.0
// @description  Notify Telegram when new GREEN ZONE patient appears (arrival time from SPP)
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

        /* ================= TELEGRAM  ================= */
        const _BOT_B64  = "ODU1MTYxMzMxMzpBQUhEa2o5QTBWNmlMRnNvUTB5SnpMQmhxQ2dhYy03dFR0cw==";
        const _CHAT_B64 = "LTEwMDM2NTgwMDIwNDQ=";

        const TELEGRAM_BOT_TOKEN = atob(_BOT_B64);
        const TELEGRAM_CHAT_ID  = atob(_CHAT_B64);

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

        function localNowStr() {
            const d = new Date();
            return d.toLocaleString();
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
            const type  = m[2].trim();

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

                const nameEl  = row.querySelector(".v-button-caption");
                const labelEl = row.querySelector(".v-label");
                const timeEl  = row.querySelector("center");

                if (!nameEl || !labelEl || !timeEl) return;

                const name = nameEl.innerText.trim();

                const idMatch = labelEl.innerText.match(/\|\s*([^|]+?\([^)]+\))/);
                const id = idMatch ? maskID(idMatch[1].trim()) : "UNKNOWN";

                const arrivalTime = timeEl.innerText.trim();

                patients.push({
                    name,
                    id,
                    arrivalTime,
                    signature: `${name}|${id}|${arrivalTime}`
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
                const now = localNowStr();

                patients.forEach(p => {
                    if (knownPatients.has(p.signature)) return;

                    beep.play().catch(() => {});

                    sendTelegram(
                        `<b>🟩 GREEN ZONE ALERT 🟩</b>\n` +
                        `New patient registered\n` +
                        `Time: ${p.arrivalTime}\n` +
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
