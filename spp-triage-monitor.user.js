// ==UserScript==
// @name         SPP Triage Monitor (Stable Mode)
// @namespace    https://github.com/scahmi/spp-triage-monitor
// @version      2.0.1
// @description  Notify when new patient appears in SPP triage (stable, no triage filter)
// @match        https://hpgspp.emrai.my/spp/*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const INTERVAL = 15000;
    const UPDATE_DELAY = 1200;

    let knownPatients = new Set();

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
        statusBox.style = `
            position:fixed;
            bottom:20px;
            left:20px;
            background:#fff;
            border:1px solid #ccc;
            padding:10px;
            border-radius:8px;
            font-family:system-ui;
            font-size:13px;
            z-index:999999;
        `;
        document.body.appendChild(statusBox);
        updateStatus("-");
    }

    function updateStatus(time) {
        statusBox.innerHTML = `
            <div><b>Monitoring Status:</b> <span style="color:#2e7d32">Monitoring</span></div>
            <div><b>Last Update:</b> ${time}</div>
        `;
    }

    /* ================= TELEGRAM ================= */
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
            const nameEl = row.querySelector(".v-button-caption");
            const labelEl = row.querySelector(".v-label");

            if (!nameEl || !labelEl) return;

            const name = nameEl.innerText.trim();

            const m = labelEl.innerText.match(/\|\s*([^|]+?\([^)]+\))/);
            const id = m ? maskID(m[1].trim()) : "UNKNOWN";

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

    function loop() {
        clickReset();

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
                            `ID: ${p.id}`
                        );
                    }
                    knownPatients.add(p.signature);
                }
            });

            updateStatus(now);
        }, UPDATE_DELAY);

        setTimeout(loop, INTERVAL);
    }

    const wait = setInterval(() => {
        if (document.getElementById("Reset")) {
            clearInterval(wait);
            createStatusBox();
            loop();
        }
    }, 500);

})();
