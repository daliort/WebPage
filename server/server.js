"use strict";

require("dotenv").config();

var express = require("express");
var cors = require("cors");
var fs = require("fs");
var path = require("path");
var nodemailer = require("nodemailer");

var app = express();
var PORT = Number(process.env.PORT) || 3000;
var ROOT = path.join(__dirname, "..");
var DATA_DIR = path.join(__dirname, "data");
var DATA_FILE = path.join(DATA_DIR, "appointments.json");

function parseCorsOrigin() {
  var raw = process.env.CORS_ORIGIN;
  if (!raw || raw === "*") return true;
  var list = raw.split(",").map(function (s) {
    return s.trim();
  }).filter(Boolean);
  return function (origin, cb) {
    if (!origin) return cb(null, true);
    if (list.indexOf(origin) !== -1) return cb(null, true);
    cb(null, false);
  };
}

app.use(cors({ origin: parseCorsOrigin(), credentials: false }));
app.use(express.json({ limit: "32kb" }));
app.use(express.static(ROOT));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readAppointments() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function writeAppointments(list) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createTransporter() {
  if (!process.env.SMTP_HOST) return null;
  var auth =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: auth,
  });
}

function formatAppointmentDateForEmail(isoDate) {
  var d = new Date(isoDate + "T12:00:00");
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTimeSlot12h(hhmm) {
  var str = String(hhmm).trim();
  var parts = str.split(":");
  var h = parseInt(parts[0], 10);
  var m = parts[1] || "00";
  if (isNaN(h)) return str;
  var period = h >= 12 ? "PM" : "AM";
  var hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return hour12 + ":" + m + " " + period;
}

app.post("/api/appointments", async function (req, res) {
  var body = req.body || {};
  var name = body.name && String(body.name).trim();
  var email = body.email && String(body.email).trim();
  var service = body.service && String(body.service).trim();
  var mode = body.mode && String(body.mode).trim();
  var appointmentDate = body.appointmentDate && String(body.appointmentDate).trim();
  var timeSlot = body.timeSlot && String(body.timeSlot).trim();
  var notes = body.notes ? String(body.notes).trim() : "";

  if (!name || !email || !service || !mode || !appointmentDate || !timeSlot) {
    return res.status(400).json({
      ok: false,
      error: "Faltan datos obligatorios.",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Correo electrónico no válido." });
  }

  var record = {
    id:
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10),
    name: name,
    email: email,
    service: service,
    mode: mode,
    appointmentDate: appointmentDate,
    timeSlot: timeSlot,
    notes: notes,
    createdAt: new Date().toISOString(),
  };

  var list = readAppointments();
  list.push(record);
  writeAppointments(list);

  var from = process.env.MAIL_FROM || process.env.SMTP_USER;
  var transport = createTransporter();
  var emailSent = false;

  if (transport && from) {
    var dateLabel = formatAppointmentDateForEmail(appointmentDate);
    var timeLabel = formatTimeSlot12h(timeSlot);
    var textBody =
      "Hola " +
      record.name +
      ",\n\n" +
      "Hemos recibido tu solicitud de cita:\n\n" +
      "Fecha: " +
      dateLabel +
      "\n" +
      "Hora: " +
      timeLabel +
      "\n" +
      "Servicio: " +
      service +
      "\n" +
      "Modalidad: " +
      mode +
      (notes ? "\n\nNotas: " + notes : "") +
      "\n\n" +
      "Esta es una confirmación automática de que recibimos tu solicitud. " +
      "Te contactaremos para confirmar la cita.\n\n" +
      "Saludos cordiales.";

    var htmlBody =
      "<p>Hola <strong>" +
      escapeHtml(record.name) +
      "</strong>,</p>" +
      "<p>Hemos recibido tu solicitud de cita:</p>" +
      "<ul>" +
      "<li>Fecha: " +
      escapeHtml(dateLabel) +
      "</li>" +
      "<li>Hora: " +
      escapeHtml(timeLabel) +
      "</li>" +
      "<li>Servicio: " +
      escapeHtml(service) +
      "</li>" +
      "<li>Modalidad: " +
      escapeHtml(mode) +
      "</li>" +
      (notes ? "<li>Notas: " + escapeHtml(notes) + "</li>" : "") +
      "</ul>" +
      "<p>Esta es una confirmación automática de que recibimos tu solicitud. " +
      "Te contactaremos para confirmar la cita.</p>";

    try {
      await transport.sendMail({
        from: '"Dawin A. Ortiz Guevara" <' + from + ">",
        to: email,
        subject: "Confirmación de solicitud de cita",
        text: textBody,
        html: htmlBody,
      });
      emailSent = true;

      if (process.env.MAIL_TO) {
        await transport.sendMail({
          from: '"Sitio web" <' + from + ">",
          to: process.env.MAIL_TO,
          subject: "Nueva solicitud de cita — " + record.name,
          text: JSON.stringify(record, null, 2),
        });
      }
    } catch (err) {
      console.error("Email send failed:", err);
      return res.status(201).json({
        ok: true,
        saved: true,
        id: record.id,
        emailSent: false,
        warning:
          "Tu solicitud fue guardada, pero no pudimos enviar el correo de confirmación. Intentaremos contactarte pronto.",
      });
    }
  }

  res.json({
    ok: true,
    saved: true,
    id: record.id,
    emailSent: emailSent,
    warning:
      !emailSent && !process.env.SMTP_HOST
        ? "Tu solicitud fue guardada. Configura el servidor de correo (SMTP) para enviar confirmaciones automáticas."
        : undefined,
  });
});

app.listen(PORT, function () {
  console.log("Servidor en http://localhost:" + PORT);
  console.log("Sitio estático desde:", ROOT);
});
