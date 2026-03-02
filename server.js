const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

app.use(session({
  secret: "sistema-ferias-secreto",
  resave: false,
  saveUninitialized: false
}));

function verificarLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect("/login");
  }
  next();
}

const upload = multer({ dest: "uploads/" });

/* LOGIN */

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario === "admin" && senha === "123") {
    req.session.usuario = usuario;
    return res.redirect("/");
  }

  res.send("Login inválido");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

/* DASHBOARD */

app.get("/", verificarLogin, async (req, res) => {

  const servidores = await pool.query("SELECT * FROM servidores ORDER BY nome");

  const periodos = await pool.query(`
    SELECT p.*, s.nome,
    (p.periodo_fim + INTERVAL '12 months') AS vencimento
    FROM periodos p
    JOIN servidores s ON s.id = p.servidor_id
    ORDER BY p.periodo_inicio DESC
  `);

  const vencendo = await pool.query(`
    SELECT s.nome, p.periodo_fim,
    (p.periodo_fim + INTERVAL '12 months') AS vencimento
    FROM periodos p
    JOIN servidores s ON s.id = p.servidor_id
    WHERE (p.periodo_fim + INTERVAL '12 months')
    BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
  `);

  res.render("index", {
    usuario: req.session.usuario,
    servidores: servidores.rows,
    periodos: periodos.rows,
    vencendo: vencendo.rows
  });

});

/* IMPORTAR RELATÓRIO RH */

app.post("/importar", verificarLogin, upload.single("arquivo"), async (req, res) => {

  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dados = XLSX.utils.sheet_to_json(sheet);

  for (let linha of dados) {

    const codigo = linha["Funcionário - Código"];
    const inicio = linha["Período Aquisitivo - Início"];
    const fim = linha["Período Aquisitivo - Final"];
    const direito = linha["Dias - Direito"];
    const pagos = linha["Dias - Pagos"];
    const saldo = linha["Dias Proporcional - Saldo"];

    const servidor = await pool.query(
      "SELECT id FROM servidores WHERE matricula = $1",
      [codigo]
    );

    if (servidor.rows.length === 0) continue;

    const servidor_id = servidor.rows[0].id;

    const existe = await pool.query(
      `SELECT id FROM periodos 
       WHERE servidor_id = $1 
       AND periodo_inicio = $2`,
      [servidor_id, inicio]
    );

    if (existe.rows.length === 0) {
      await pool.query(
        `INSERT INTO periodos 
        (servidor_id, periodo_inicio, periodo_fim, dias_direito, dias_pagos, saldo)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [servidor_id, inicio, fim, direito, pagos, saldo]
      );
    }
  }

  fs.unlinkSync(req.file.path);

  res.redirect("/");
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});