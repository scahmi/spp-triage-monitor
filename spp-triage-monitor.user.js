// ==UserScript==
// @name         SPP Triage Monitor
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      1.1.1
// @description  Auto monitor SPP triage, Telegram alerts for Level 4 & 5
// @author       ETD HPG
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @downloadURL  https://raw.githubusercontent.com/scahmi/spp-triage-monitor/main/spp-triage-monitor.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ================= SETTINGS ================= */
    const interval = 15000;
    const updateDelay = 1200;
    let running = true;
    let knownPatients = new Set();

    /* ================= TELEGRAM ================= */
    const TELEGRAM_BOT_TOKEN = "PUT_NEW_BOT_TOKEN_HERE";
    const TELEGRAM_CHAT_ID  = "-1003658002044";

    const beep = new Audio(
        "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
    );

    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    /* ================= STATUS BAR ================= */
    let statusBox;

    function formatDate(d) {
        const pad = n => n.toString().padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function updateStatus(isRunning, lastUpdate = "-") {
        if (!statusBox) return;

        statusBox.innerHTML = `
            <div>
                <strong>Monitoring Status:</strong>
                <span style="color:${isRunning ? "#2e7d32" : "#777"};font-weight:600">
                    ${isRunning ? "Monitoring" : "Not monitoring"}
                </span>
            </div>
            <div><strong>Last Update:</strong> ${lastUpdate}</div>
        `;
    }

    function createStatusBox() {
        statusBox = document.createElement("div");
        Object.assign(statusBox.style, {
            position: "fixed",
            bottom: "20px",
            left: "20px",
            zIndex: "999999",
            padding: "10px 14px",
            background: "#ffffff",
            color: "#222",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: "8px",
            fontSize: "13px",
            lineHeight: "1.4",
            minWidth: "260px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontFamily: `
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                Roboto,
                Helvetica,
                Arial,
                sans-serif
            `
        });

        document.body.appendChild(statusBox);
        updateStatus(true, "-");
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

        // NRIC → 12 digits
        if (/^\d{12}$/.test(value)) {
            const masked = value.replace(/(\d{8})\d{4}/, "$1XXXX");
            return `${masked} (${type})`;
        }

        // Passport → alphanumeric
        if (/passport/i.test(type) && value.length >= 6) {
            const keep = Math.ceil(value.length / 2);
            const masked =
                value.slice(0, keep) + "X".repeat(value.length - keep);
            return `${masked} (${type})`;
        }

        return idText;
    }

    /* ================= DATA EXTRACTION ================= */
    function extractPatients() {
        const rows = document.querySelectorAll("table tbody tr");
        const patients = [];

        rows.forEach(row => {

            // ----- TRIAGE LEVEL -----
            let triageText = null;
            row.querySelectorAll("span").forEach(s => {
                const t = s.innerText.trim();
                if (/^LEVEL\s*\d/i.test(t)) triageText = t;
            });
            if (!triageText) return;

            const levelMatch = triageText.match(/LEVEL\s*(\d)/i);
            if (!levelMatch) return;

            const levelNum = parseInt(levelMatch[1], 10);
            if (![4, 5].includes(levelNum)) return;

            // ----- NAME -----
            const nameEl = row.querySelector(".v-button-caption");
            const name = nameEl ? nameEl.innerText.trim() : "UNKNOWN";

            // ----- ID -----
            let idText = "UNKNOWN";
            row.querySelectorAll(".v-label").forEach(lbl => {
                const t = lbl.innerText;
                const m = t.match(/\|\s*([^|]+?\([^)]+\))/);
                if (m) idText = maskID(m[1].trim());
            });

            const signature = `${name}|${idText}|Level ${levelNum}`;

            patients.push({
                name,
                id: idText,
                triage: `Level ${levelNum}`,
                signature
            });
        });

        return patients;
    }

    /* ================= RESET HANDLING ================= */
    function waitForReset(cb) {
        const t = setInterval(() => {
            const btn = document.getElementById("Reset");
            if (btn) {
                clearInterval(t);
                cb();
            }
        }, 500);
    }

    function clickResetButton() {
        const btn = document.getElementById("Reset");
        if (btn) btn.click();
    }

    /* ================= MAIN LOOP ================= */
    function monitor() {
        if (!running) {
            updateStatus(false);
            return;
        }

        clickResetButton();

        setTimeout(() => {
            const patients = extractPatients();
            const now = formatDate(new Date());

            patients.forEach(p => {
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

            updateStatus(true, now);

        }, updateDelay);

        setTimeout(monitor, interval);
    }

    /* ================= START ================= */
    waitForReset(() => {
        createStatusBox();
        monitor();
    });

})();
