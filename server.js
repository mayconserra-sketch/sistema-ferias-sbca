const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

app.use(session({
  secret: "sbca-ferias-secret",
  resave: false,
  saveUninitialized: true
}));

const USER = "Maycon";
const PASS = "615243";

/* =========================
   FUNÇÕES AUXILIARES
========================= */

function carregarServidores() {
  return JSON.parse(fs.readFileSync("servidores.json"));
}

function carregarFerias() {
  return JSON.parse(fs.readFileSync("ferias-agendadas.json"));
}

function salvarFerias(dados) {
  fs.writeFileSync("ferias-agendadas.json", JSON.stringify(dados, null, 2));
}

function diasRestantes(dataFinal) {
  const hoje = new Date();
  const final = new Date(dataFinal);
  const diff = final - hoje;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/* =========================
   LOGIN
========================= */

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario === USER && senha === PASS) {
    req.session.logado = true;
    return res.redirect("/");
  }

  res.send("Login inválido");
});

/* =========================
   DASHBOARD
========================= */

app.get("/", (req, res) => {
  if (!req.session.logado) return res.redirect("/login");

  const servidores = carregarServidores();
  const ferias = carregarFerias();
  const hoje = new Date().toISOString().split("T")[0];

  const analise = servidores.map(s => {
    const dias = diasRestantes(s.periodoFinal);
    return { ...s, dias };
  });

  const avisosHoje = ferias.filter(f => f.avisoCI === hoje && !f.ciEnviada);

  res.render("dashboard", { analise, avisosHoje });
});

/* =========================
   FÉRIAS AGENDADAS
========================= */

app.get("/ferias", (req, res) => {
  if (!req.session.logado) return res.redirect("/login");

  const ferias = carregarFerias();
  res.render("ferias", { ferias });
});

app.post("/ferias", (req, res) => {
  const { nome, inicio } = req.body;

  let ferias = carregarFerias();

  const inicioDate = new Date(inicio);
  const avisoCI = new Date(inicioDate);
  avisoCI.setDate(avisoCI.getDate() - 45);

  ferias.push({
    nome,
    inicio,
    avisoCI: avisoCI.toISOString().split("T")[0],
    ciEnviada: false,
    avisoEnviado: false
  });

  salvarFerias(ferias);

  res.redirect("/ferias");
});

/* =========================
   MARCAR C.I ENVIADA
========================= */

app.post("/marcar-ci/:index", (req, res) => {
  let ferias = carregarFerias();
  const index = req.params.index;

  ferias[index].ciEnviada = true;

  salvarFerias(ferias);

  res.redirect("/ferias");
});

/* =========================
   ROTINA AUTOMÁTICA 09:00
========================= */

cron.schedule("0 9 * * *", () => {
  console.log("Verificando avisos de C.I...");

  let ferias = carregarFerias();
  const hoje = new Date().toISOString().split("T")[0];

  ferias.forEach(f => {
    if (f.avisoCI === hoje && !f.avisoEnviado) {
      console.log(`⚠ Emitir C.I para ${f.nome}`);
      f.avisoEnviado = true;
    }
  });

  salvarFerias(ferias);
});

/* =========================
   INICIAR SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log("Sistema de Controle de Férias – SBCA rodando na porta " + PORT);
});