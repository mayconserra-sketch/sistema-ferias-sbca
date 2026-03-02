const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;

// Banco PostgreSQL
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

// Middleware login
function verificarLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect("/login");
  }
  next();
}

// LOGIN SIMPLES
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

// DASHBOARD PRINCIPAL
app.get("/", verificarLogin, async (req, res) => {

  const servidores = await pool.query("SELECT * FROM servidores ORDER BY id");

  let filtroMes = req.query.mes;

  let queryFerias = `
    SELECT f.*, s.nome 
    FROM ferias f
    JOIN servidores s ON s.id = f.servidor_id
  `;

  if (filtroMes) {
    queryFerias += `
      WHERE TO_CHAR(f.data_inicio, 'YYYY-MM') = '${filtroMes}'
    `;
  }

  queryFerias += " ORDER BY f.data_inicio";

  const ferias = await pool.query(queryFerias);

  const totalServidores = servidores.rows.length;

  const feriasAtivas = await pool.query(`
    SELECT COUNT(*) FROM ferias
    WHERE CURRENT_DATE BETWEEN data_inicio AND data_fim
  `);

  const feriasFuturas = await pool.query(`
    SELECT COUNT(*) FROM ferias
    WHERE data_inicio > CURRENT_DATE
  `);

  res.render("index", {
    usuario: req.session.usuario,
    servidores: servidores.rows,
    ferias: ferias.rows,
    totalServidores,
    feriasAtivas: feriasAtivas.rows[0].count,
    feriasFuturas: feriasFuturas.rows[0].count
  });

});

// CADASTRAR SERVIDOR
app.post("/servidor", verificarLogin, async (req, res) => {
  const { nome, matricula } = req.body;

  await pool.query(
    "INSERT INTO servidores (nome, matricula) VALUES ($1, $2)",
    [nome, matricula]
  );

  res.redirect("/");
});

// CADASTRAR FÉRIAS COM VALIDAÇÃO
app.post("/ferias", verificarLogin, async (req, res) => {
  const { servidor_id, data_inicio, data_fim } = req.body;

  const conflito = await pool.query(
    `SELECT * FROM ferias 
     WHERE servidor_id = $1
     AND (data_inicio, data_fim) OVERLAPS ($2, $3)`,
    [servidor_id, data_inicio, data_fim]
  );

  if (conflito.rows.length > 0) {
    return res.send("⚠️ Já existe férias nesse período para esse servidor.");
  }

  await pool.query(
    "INSERT INTO ferias (servidor_id, data_inicio, data_fim) VALUES ($1, $2, $3)",
    [servidor_id, data_inicio, data_fim]
  );

  res.redirect("/");
});

// EXCLUIR FÉRIAS
app.post("/ferias/delete/:id", verificarLogin, async (req, res) => {
  const { id } = req.params;

  await pool.query("DELETE FROM ferias WHERE id = $1", [id]);

  res.redirect("/");
});

// EXPORTAR PDF
app.get("/relatorio", verificarLogin, async (req, res) => {

  const ferias = await pool.query(`
    SELECT f.*, s.nome 
    FROM ferias f
    JOIN servidores s ON s.id = f.servidor_id
    ORDER BY f.data_inicio
  `);

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=relatorio-ferias.pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Relatório de Férias SBCA");
  doc.moveDown();

  ferias.rows.forEach(f => {
    const inicio = new Date(f.data_inicio).toISOString().split("T")[0];
    const fim = new Date(f.data_fim).toISOString().split("T")[0];

    doc.text(`${f.nome} - ${inicio} até ${fim}`);
  });

  doc.end();
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
